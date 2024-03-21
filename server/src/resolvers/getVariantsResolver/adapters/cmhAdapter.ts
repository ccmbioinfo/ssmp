import axios, { AxiosError } from 'axios';
import jwtDecode from 'jwt-decode';
import { URLSearchParams } from 'url';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../../logger';
import {
  ErrorTransformer,
  IndividualResponseFields,
  QueryInput,
  ResultTransformer,
  VariantQueryResponse,
  VariantResponseFields,
  G4RDFamilyQueryResult,
  G4RDPatientQueryResult,
  Disorder,
  IndividualInfoFields,
  PhenotypicFeaturesFields,
  NonStandardFeature,
  Feature,
  PTVariantArray,
} from '../../../types';
import { getFromCache, putInCache } from '../../../utils/cache';
import { timeit, timeitAsync } from '../../../utils/timeit';
import resolveAssembly from '../utils/resolveAssembly';
import fetchPhenotipsVariants from '../utils/fetchPhenotipsVariants';
import fetchPhenotipsPatients from '../utils/fetchPhenotipsPatients';

/* eslint-disable camelcase */

/**
 * CMH's PhenoTips instance should have the same format as G4RD.
 * However, there's a different process in place for accessing it:
 * - Request access token from Azure,
 * - Provide token and Gene42 secret when querying CMH PT.
 */

const SOURCE_NAME = 'cmh';
const AZURE_BEARER_CACHE_KEY = 'cmhToken';

type CMHNodeQueryError = AxiosError<string>;

/**
 * @param args VariantQueryInput
 * @returns  Promise<ResolvedVariantQueryResult>
 */
const _getCMHNodeQuery = async ({
  input: { gene: geneInput, variant },
}: QueryInput): Promise<VariantQueryResponse> => {
  let CMHNodeQueryError: CMHNodeQueryError | null = null;
  let CMHVariants: null | PTVariantArray = null;
  let CMHPatientQueryResponse: null | G4RDPatientQueryResult[] = null;
  const FamilyIds: null | Record<string, string> = {}; // <PatientId, FamilyId>
  let Authorization = '';
  try {
    Authorization = await getAuthHeader();
  } catch (e: any) {
    logger.error(e);
    logger.error(JSON.stringify(e?.response?.data));
    return {
      data: [],
      error: { code: 403, message: 'ERROR FETCHING OAUTH TOKEN', id: uuidv4() },
      source: SOURCE_NAME,
    };
  }
  /* eslint-disable @typescript-eslint/no-unused-vars */
  variant.assemblyId = 'GRCh38';
  // the replacement
  try {
    CMHVariants = await fetchPhenotipsVariants(
      process.env.CMH_URL as string,
      geneInput,
      variant,
      getAuthHeader
    );

    // Get patients info
    if (CMHVariants && CMHVariants.length > 0) {
      logger.debug(`CMHVariants length: ${CMHVariants.length}`);
      let individualIds = CMHVariants.flatMap(v => v.individualIds).filter(Boolean); // Filter out undefined and null values.

      // Get all unique individual Ids.
      individualIds = [...new Set(individualIds)];

      if (individualIds.length > 0) {
        try {
          CMHPatientQueryResponse = await fetchPhenotipsPatients(
            process.env.CMH_URL!,
            individualIds,
            getAuthHeader
          );
        } catch (e) {
          logger.error(JSON.stringify(e));
          CMHPatientQueryResponse = [];
        }

        // Get Family Id for each patient.
        const patientFamily = axios.create({
          headers: {
            Authorization,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-Gene42-Secret': `${process.env.CMH_GENE42_SECRET}`,
          },
        });

        const familyResponses = await Promise.allSettled(
          individualIds.map(id =>
            patientFamily.get<G4RDFamilyQueryResult>(
              new URL(`${process.env.CMH_URL}/rest/patients/${id}/family`).toString()
            )
          )
        );

        familyResponses.forEach((response, index) => {
          if (response.status === 'fulfilled' && response.value.status === 200) {
            FamilyIds[individualIds[index]] = response.value.data.id;
          }
        });
      }
    }
  } catch (e: any) {
    logger.error(e);
    logger.debug(JSON.stringify(e));
    CMHNodeQueryError = e;
  }

  return {
    data: transformCMHQueryResponse(
      (CMHVariants as PTVariantArray) || [],
      (CMHPatientQueryResponse as G4RDPatientQueryResult[]) || [],
      FamilyIds
    ),
    error: transformCMHNodeErrorResponse(CMHNodeQueryError),
    source: SOURCE_NAME,
  };
};

/**
 * @param args VariantQueryInput
 * @returns  Promise<ResolvedVariantQueryResult>
 */
const getCMHNodeQuery = timeitAsync('getCMHNodeQuery')(_getCMHNodeQuery);

const getAuthHeader = async () => {
  const {
    CMH_AZURE_CLIENT_ID: client_id,
    CMH_AZURE_CLIENT_SECRET: client_secret,
    CMH_TOKEN_URL,
    CMH_RESOURCE: resource,
    CMH_SCOPE: scope,
    CMH_GRANT_TYPE: grant_type,
  } = process.env;
  const cachedToken = getFromCache(AZURE_BEARER_CACHE_KEY);
  if (cachedToken) {
    return `Bearer ${cachedToken}`;
  }

  const params = new URLSearchParams({
    client_id,
    client_secret,
    resource,
    scope,
    grant_type,
  } as Record<string, string>);

  const tokenResponse = await axios.post<{ access_token: string }>(CMH_TOKEN_URL!, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: '*/*' },
  });
  const token = tokenResponse.data.access_token;
  const decoded = jwtDecode<{ iat: number; exp: number }>(token);
  const ttl = decoded.exp - Date.now() / 1000;
  putInCache(AZURE_BEARER_CACHE_KEY, token, ttl);
  return `Bearer ${token}`;
};

export const transformCMHNodeErrorResponse: ErrorTransformer<CMHNodeQueryError> = error => {
  if (!error) {
    return undefined;
  } else {
    return {
      id: uuidv4(),
      code: error.response?.status || 500,
      message:
        error.response?.status === 404
          ? 'No variants found matching your query.'
          : error.response?.statusText,
    };
  }
};

const isObserved = (feature: Feature | NonStandardFeature) =>
  feature.observed === 'yes' ? true : feature.observed === 'no' ? false : undefined;

export const transformCMHQueryResponse: ResultTransformer<PTVariantArray> = timeit(
  'transformCMHQueryResponse'
)(
  (
    variants: PTVariantArray,
    patientResponse: G4RDPatientQueryResult[],
    familyIds: Record<string, string>
  ) => {
    const individualIdsMap = Object.fromEntries(patientResponse.map(p => [p.id, p]));

    return (variants || []).flatMap(r => {
      /* eslint-disable @typescript-eslint/no-unused-vars */
      r.variant.assemblyId = resolveAssembly(r.variant.assemblyId);
      const { individualIds } = r;

      return individualIds.map(individualId => {
        const patient = individualIdsMap[individualId];

        const contactInfo: string = patient.contact
          ? patient.contact.map(c => c.name).join(', ')
          : '';

        let info: IndividualInfoFields = {};
        let ethnicity: string = '';
        let disorders: Disorder[] = [];
        let phenotypicFeatures: PhenotypicFeaturesFields[] = [];

        if (patient) {
          const candidateGene = (patient.genes ?? []).map(g => g.gene).join('\n');
          const classifications = (patient.genes ?? []).map(g => g.status).join('\n');
          const diagnosis = patient.clinicalStatus;
          const solved = patient.solved ? patient.solved.status : '';
          const clinicalStatus = patient.clinicalStatus;
          disorders = patient.disorders.filter(({ label }) => label !== 'affected') as Disorder[];
          ethnicity = Object.values(patient.ethnicity)
            .flat()
            .map(p => p.trim())
            .join(', ');
          info = {
            solved,
            candidateGene,
            diagnosis,
            classifications,
            clinicalStatus,
            disorders,
          };
          // variant response contains all phenotypic features listed,
          // even if some of them are explicitly _not_ observed by clinician and recorded as such
          const features = [...(patient.features ?? []), ...(patient.nonstandard_features ?? [])];
          const finalFeatures: PhenotypicFeaturesFields[] = features.map(feat => {
            return {
              // ageOfOnset: null,
              // dateOfOnset: null,
              levelSeverity: null,
              // onsetType: null,
              phenotypeId: feat.id,
              phenotypeLabel: feat.label,
              observed: isObserved(feat),
            };
          });
          phenotypicFeatures = finalFeatures;
        }

        const variant: VariantResponseFields = {
          alt: r.variant.alt,
          assemblyId: r.variant.assemblyId,
          callsets: r.variant.callsets,
          end: r.variant.end,
          ref: r.variant.ref,
          start: r.variant.start,
          chromosome: r.variant.chromosome,
          info: r.variant.info,
        };

        const familyId: string = familyIds[individualId];

        const individualResponseFields: IndividualResponseFields = {
          sex: patient.sex,
          ethnicity,
          info,
          familyId,
          phenotypicFeatures,
          individualId,
        };
        return { individual: individualResponseFields, variant, contactInfo, source: SOURCE_NAME };
      });
    });
  }
);

export default getCMHNodeQuery;
