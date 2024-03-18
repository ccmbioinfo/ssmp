import axios, { AxiosError, AxiosResponse } from 'axios';
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
  G4RDVariantQueryResult,
  Disorder,
  IndividualInfoFields,
  PhenotypicFeaturesFields,
  NonStandardFeature,
  Feature,
} from '../../../types';
import { getFromCache, putInCache } from '../../../utils/cache';
import { timeit, timeitAsync } from '../../../utils/timeit';
import resolveAssembly from '../utils/resolveAssembly';
import resolveChromosome from '../utils/resolveChromosome';

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
  let CMHVariantQueryResponse: null | AxiosResponse<G4RDVariantQueryResult> = null;
  let CMHPatientQueryResponse: null | AxiosResponse<G4RDPatientQueryResult> = null;
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
  const url = `${process.env.CMH_URL}/rest/variants/match`;
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const { position, ...gene } = geneInput;
  const {chromosome: chrom, start, end} = resolveChromosome(position);
  variant.assemblyId = 'GRCh38';
  try {
    CMHVariantQueryResponse = await axios.post<G4RDVariantQueryResult>(
      url,
      {
        gene,
        variant: {
          ...variant,
          position: {
            chrom: Number(chrom),
            start: Number(start),
            end: Number(end),
          },
        },
      },
      {
        headers: {
          Authorization,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Gene42-Secret': `${process.env.CMH_GENE42_SECRET}`,
        },
      }
    );

    // Get patients info
    if (CMHVariantQueryResponse) {
      let individualIds = CMHVariantQueryResponse.data.results
        .map(v => v.individual.individualId!)
        .filter(Boolean); // Filter out undefined and null values.

      // Get all unique individual Ids.
      individualIds = [...new Set(individualIds)];

      if (individualIds.length > 0) {
        const patientUrl = `${process.env.CMH_URL}/rest/patients/fetch?${individualIds
          .map(id => `id=${id}`)
          .join('&')}`;

        CMHPatientQueryResponse = await axios.get<G4RDPatientQueryResult>(
          new URL(patientUrl).toString(),
          {
            headers: {
              Authorization,
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'X-Gene42-Secret': `${process.env.CMH_GENE42_SECRET}`,
            },
          }
        );

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
      (CMHVariantQueryResponse?.data as G4RDVariantQueryResult) || [],
      (CMHPatientQueryResponse?.data as G4RDPatientQueryResult) || [],
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

export const transformCMHQueryResponse: ResultTransformer<G4RDVariantQueryResult> = timeit(
  'transformCMHQueryResponse'
)(
  (
    variantResponse: G4RDVariantQueryResult,
    patientResponse: G4RDPatientQueryResult[],
    familyIds: Record<string, string>
  ) => {
    const individualIdsMap = Object.fromEntries(patientResponse.map(p => [p.id, p]));

    return (variantResponse.results || []).map(r => {
      /* eslint-disable @typescript-eslint/no-unused-vars */
      r.variant.assemblyId = resolveAssembly(r.variant.assemblyId);
      const { individual, contactInfo } = r;

      const patient = individual.individualId ? individualIdsMap[individual.individualId] : null;

      let info: IndividualInfoFields = {};
      let ethnicity: string = '';
      let disorders: Disorder[] = [];
      let phenotypicFeatures: PhenotypicFeaturesFields[] = individual.phenotypicFeatures || [];

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
        if (individual.phenotypicFeatures !== null && individual.phenotypicFeatures !== undefined) {
          const features = [...(patient.features ?? []), ...(patient.nonstandard_features ?? [])];
          const detailedFeatures = individual.phenotypicFeatures;
          // build list of features the safe way
          const detailedFeatureMap = Object.fromEntries(
            detailedFeatures.map(feat => [feat.phenotypeId, feat])
          );
          const finalFeatures: PhenotypicFeaturesFields[] = features.map(feat => {
            if (feat.id === undefined) {
              return {
                ageOfOnset: null,
                dateOfOnset: null,
                levelSeverity: null,
                onsetType: null,
                phenotypeId: feat.id,
                phenotypeLabel: feat.label,
                observed: isObserved(feat),
              };
            }
            return {
              ...detailedFeatureMap[feat.id],
              observed: isObserved(feat),
            };
          });
          phenotypicFeatures = finalFeatures;
        }
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

      let familyId: string = '';
      if (individual.individualId) familyId = familyIds[individual.individualId];

      const individualResponseFields: IndividualResponseFields = {
        ...individual,
        ethnicity,
        info,
        familyId,
        phenotypicFeatures,
      };
      return { individual: individualResponseFields, variant, contactInfo, source: SOURCE_NAME };
    });
  }
);

export default getCMHNodeQuery;
