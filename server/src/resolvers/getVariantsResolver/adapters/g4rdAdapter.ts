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
import { QueryResponseError } from '../utils/queryResponseError';
import { liftoverOne } from '../utils/liftOver';
import resolveChromosome from '../utils/resolveChromosome';

/* eslint-disable camelcase */

const SOURCE_NAME = 'g4rd';
const BEARER_CACHE_KEY = 'g4rdToken';

type G4RDNodeQueryError = AxiosError<string>;

/**
 * @param args VariantQueryInput
 * @returns  Promise<ResolvedVariantQueryResult>
 */
const _getG4rdNodeQuery = async ({
  input: { gene: geneInput, variant },
}: QueryInput): Promise<VariantQueryResponse> => {
  let G4RDNodeQueryError: G4RDNodeQueryError | null = null;
  let G4RDVariants: null | PTVariantArray = null;
  let G4RDPatientQueryResponse: null | G4RDPatientQueryResult[] = null;
  const FamilyIds: Record<string, string> = {}; // <PatientId, FamilyId>
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

  if (variant.assemblyId.includes('38')) {
    // convert to 37 if the position is in 38
    const pos = resolveChromosome(geneInput.position);
    const lifted = await liftoverOne(
      {
        chromosome: pos.chromosome,
        start: Number(pos.start),
        end: Number(pos.end),
      },
      'GRCh37',
      variant.assemblyId
    );
    geneInput.position = `${pos.chromosome}:${lifted.start}-${lifted.end}`;
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
  variant.assemblyId = 'GRCh37';
  // For g4rd node, assemblyId is a required field as specified in this sample request:
  // https://github.com/ccmbioinfo/report-scripts/blob/master/docs/phenotips-api.md#matching-endpoint
  // assemblyId is set to be GRCh37 because g4rd node only contains data in assembly GRCh37.

  try {
    G4RDVariants = await fetchPhenotipsVariants(
      process.env.G4RD_URL as string,
      geneInput,
      variant,
      getAuthHeader
    );

    // Get patients info
    if (G4RDVariants && G4RDVariants.length > 0) {
      let individualIds = G4RDVariants.flatMap(v => v.individualIds).filter(Boolean); // Filter out undefined and null values.

      // Get all unique individual Ids.
      individualIds = [...new Set(individualIds)];

      if (individualIds.length > 0) {
        try {
          G4RDPatientQueryResponse = await fetchPhenotipsPatients(
            process.env.G4RD_URL!,
            individualIds,
            getAuthHeader
          );
        } catch (e) {
          logger.error(JSON.stringify(e));
          G4RDPatientQueryResponse = [];
        }

        // Get Family Id for each patient.
        const patientFamily = axios.create({
          headers: {
            Authorization,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        });

        const familyResponses = await Promise.allSettled(
          individualIds.map((id, i) => {
            return patientFamily.get<G4RDFamilyQueryResult>(
              new URL(`${process.env.G4RD_URL}/rest/patients/${id}/family`).toString()
            );
          })
        );

        familyResponses.forEach((response, index) => {
          if (response.status === 'fulfilled' && response.value.status === 200) {
            FamilyIds[individualIds[index]] = response.value.data.id;
          }
        });
      }
    }
    if (G4RDVariants?.length === 0) {
      // No variants, hence no point in processing anything else
      return {
        data: [],
        source: SOURCE_NAME,
        error: {
          code: 404,
          id: uuidv4(),
          message: 'No variants found matching your query.',
        },
      };
    }
  } catch (e: any) {
    if (e instanceof QueryResponseError) {
      e.source = SOURCE_NAME;
    }
    logger.error(e);
    G4RDNodeQueryError = e;
  }

  return {
    data: transformG4RDQueryResponse(
      (G4RDVariants as PTVariantArray) || [],
      (G4RDPatientQueryResponse as G4RDPatientQueryResult[]) || [],
      FamilyIds
    ),
    error: transformG4RDNodeErrorResponse(G4RDNodeQueryError),
    source: SOURCE_NAME,
  };
};

/**
 * @param args VariantQueryInput
 * @returns  Promise<ResolvedVariantQueryResult>
 */
const getG4rdNodeQuery = timeitAsync('getG4rdNodeQuery')(_getG4rdNodeQuery);

const getAuthHeader = async () => {
  const {
    G4RD_USERNAME: username,
    G4RD_PASSWORD: password,
    G4RD_TOKEN_URL,
    G4RD_REALM: realm,
    G4RD_CLIENT_ID: client_id,
    G4RD_GRANT_TYPE: grant_type,
  } = process.env;
  if (process.env.G4RD_AUTH_METHOD === 'basic') {
    return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  } else if (process.env.G4RD_AUTH_METHOD === 'bearer') {
    const cachedToken = getFromCache(BEARER_CACHE_KEY);
    if (cachedToken) {
      return `Bearer ${cachedToken}`;
    }

    const params = new URLSearchParams({
      client_id,
      grant_type,
      password,
      realm,
      scope: 'openid profile email',
      username,
    } as Record<string, string>);

    const tokenResponse = await axios.post<{ id_token: string }>(G4RD_TOKEN_URL!, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: '*/*' },
    });
    const token = tokenResponse.data.id_token; // docs say to use id_token, not bearer_token
    const decoded = jwtDecode<{ iat: number; exp: number }>(token);
    const ttl = decoded.exp - Date.now() / 1000;
    putInCache(BEARER_CACHE_KEY, token, ttl);
    return `Bearer ${token}`;
  } else {
    throw new Error(`NO AUTH METHOD CONFIGURED FOR ${SOURCE_NAME}!`);
  }
};

export const transformG4RDNodeErrorResponse: ErrorTransformer<G4RDNodeQueryError> = error => {
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

export const transformG4RDQueryResponse: ResultTransformer<PTVariantArray> = timeit(
  'transformG4RDQueryResponse'
)(
  (
    variants: PTVariantArray,
    patientResponse: G4RDPatientQueryResult[],
    familyIds: Record<string, string>
  ) => {
    const individualIdsMap = Object.fromEntries(patientResponse.map(p => [p.id, p]));
    // Format we want: list where every entry is a variant-patient pair
    // Received format: list of variants, and list of patients. Each variant has list of patient IDs associated to it.

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

          // UPDATE Dec 2022: variant response no longer contains phenotypic features as of pagination change
          // We only have patient query for features
          // Some fields are lost (see 'null' fields below), but G4RD approves since they aren't visible on the front-end anyways
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

export default getG4rdNodeQuery;
