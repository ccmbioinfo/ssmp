/**
 * Handles fetching from /rest/variants/match endpoint in Phenotips.
 */
import axios from 'axios';
import { GeneQueryInput, PTPaginatedVariantQueryResult, VariantQueryInput } from '../../../types';
import logger from '../../../logger';
import resolveChromosome from './resolveChromosome';
import { QueryResponseError } from './queryResponseError';

// How many variants to query for at a time?
const COUNT = 25;

// How many times to retry a given query before throwing the error back?
const RETRY_COUNT = 3;

/**
 * Return a complete list of results from Phenotips with a given query to /rest/variants/match.
 * Collects paginated results as a single array of results.
 *
 * @param baseUrl The URL where the Phenotips instance is hosted. Used as {baseUrl}/rest/variants/match
 * @param gene Gene query parameter.
 * @param variant Variant query parameter.
 * @param authorization Authorization header string to use with query.
 * @throws
 */
const fetchPhenotipsVariants = async (
  baseUrl: string,
  gene: GeneQueryInput,
  variant: VariantQueryInput,
  getAuthorization: () => Promise<string>,
  additionalHeaders: { [k: string]: string } = {}
): Promise<PTPaginatedVariantQueryResult['results']> => {
  let currentPage = 1;
  let collectedResults: PTPaginatedVariantQueryResult['results'] = [];
  let maxResults = Infinity;
  const count = COUNT;
  const _position = resolveChromosome(gene.position);
  const isGRCh38 = (['38', 'GRCh38', 'hg38'] as VariantQueryInput['assemblyId'][]).includes(
    variant.assemblyId
  );

  const chromosome =
    ['X', 'Y'].indexOf(_position.chromosome) !== -1
      ? _position.chromosome
      : Number(_position.chromosome);

  const position = {
    chrom: isGRCh38 ? `chr${chromosome}` : chromosome,
    start: Number(_position.start),
    end: Number(_position.end),
  };

  let numFailedQueries = 0;

  logger.debug(
    `Begin fetching paginated variants from ${baseUrl}/rest/variants/match. gene: ${JSON.stringify(
      gene
    )}, variant: ${JSON.stringify(variant)}`
  );
  do {
    try {
      const payload = {
        page: currentPage,
        limit: count,
        variant: {
          ...variant,
          position,
          assemblyId: isGRCh38 ? 'GRCh38' : 'GRCh37',
        },
      };
      const variantQueryResponse = await axios.post<PTPaginatedVariantQueryResult>(
        `${baseUrl}/rest/variants/match`,
        payload,
        {
          headers: {
            Authorization: await getAuthorization(),
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...additionalHeaders,
          },
        }
      );
      if (variantQueryResponse && variantQueryResponse.data.exists) {
        const { results, numTotalResults } = variantQueryResponse.data;
        logger.debug(
          `Successful query of page ${currentPage}, limit ${count}, total: ${numTotalResults}`
        );
        // expect page = currentPage, limit = count
        maxResults = numTotalResults;
        collectedResults = collectedResults.concat(results);
        currentPage += 1;
      } else {
        if (collectedResults.length === 0) {
          logger.warn(`Variant data does not exist at position ${JSON.stringify(position)}`);
          logger.debug(JSON.stringify(variantQueryResponse.data));
          return [];
        } else {
          // it would be really weird if this happened. the error existed on one page but not the next?
          logger.error(
            `Position '${JSON.stringify(
              position
            )}' has missing data on page ${currentPage} somehow??`
          );
          throw new QueryResponseError({
            code: 500,
            message: 'Internal Server Error',
            source: 'PhenoTips', // should be updated in error catch
          });
        }
      }
    } catch (error: any) {
      numFailedQueries += 1;
      if (numFailedQueries > RETRY_COUNT) {
        logger.error(JSON.stringify(error));
        throw error;
      } else {
        logger.warn(
          `Failed fetch (${numFailedQueries}/${RETRY_COUNT}) to ${baseUrl}/rest/variants/match, page: ${currentPage}`
        );
        logger.warn(JSON.stringify(error));
      }
    }
  } while (collectedResults.length < maxResults);
  logger.debug(
    `Fetched ${collectedResults.length} variants across ${currentPage - 1} pages from ${baseUrl}`
  );

  return collectedResults;
};

export default fetchPhenotipsVariants;
