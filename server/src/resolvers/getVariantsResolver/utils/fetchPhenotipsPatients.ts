/**
 * Handles fetching from /rest/patients/match endpoint in Phenotips.
 */
import axios from 'axios';
import { G4RDPatientQueryResult } from '../../../types';
import logger from '../../../logger';

// How many IDs to query at a time?
const COUNT = 50;

/**
 * Fetch patients from /rest/patients/match and return the complete result.
 *
 * @param baseUrl The URL where the Phenotips instance is hosted. Used as `{baseUrl}/rest/patients/match`
 * @param individualIds Individual IDs to query for.
 * @param authorization Authorization header string to use with query.
 * @throws
 */
const fetchPhenotipsPatients = async (
  baseUrl: string,
  individualIds: string[],
  getAuthorization: () => Promise<string>,
  additionalHeaders: { [k: string]: string } = {}
): Promise<G4RDPatientQueryResult[]> => {
  let currStart = 0;
  let currEnd = COUNT;

  let finalPatientQueryResponse: G4RDPatientQueryResult[] = [];

  logger.debug(
    `Begin fetching patients from ${baseUrl}/rest/patients/fetch. Total expected patients: ${individualIds.length}`
  );

  try {
    while (currStart < individualIds.length) {
      const currEndCapped = Math.min(currEnd, individualIds.length);
      const queryIds = individualIds.slice(currStart, currEndCapped);
      const patientUrl = `${baseUrl}/rest/patients/fetch?${queryIds
        .map(id => `id=${id}`)
        .join('&')}`;
      const patientQueryResponse = await axios.get<G4RDPatientQueryResult[]>(
        new URL(patientUrl).toString(),
        {
          headers: {
            Authorization: await getAuthorization(),
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...additionalHeaders,
          },
        }
      );
      finalPatientQueryResponse = finalPatientQueryResponse.concat(
        patientQueryResponse?.data || []
      );
      logger.debug(
        `Successful query for patients, received ${finalPatientQueryResponse.length} of ${individualIds.length}.`
      );
      currStart += COUNT;
      currEnd += COUNT;
    }
  } catch (error: any) {
    logger.error(JSON.stringify(error));
    throw error; // Adapters will need to handle this error
  }

  return finalPatientQueryResponse;
};

export default fetchPhenotipsPatients;
