import axios, { AxiosError, AxiosResponse } from 'axios';
import { PubSub } from 'graphql-subscriptions';
import { QUERY_RESOLVED } from '../..';
import logger from '../../../logger';
import { ErrorTransformer, QueryInput, ResolvedVariantQueryResult } from '../../../types';

type RemoteTestNodeQueryError = AxiosError;

/**
 * @param args VariantQueryInput
 * @returns  Promise<ResolvedVariantQueryResult>
 * Return some dummy data for testing and design purposes
 */
const getRemoteTestNodeQuery = async (
  args: QueryInput,
  pubsub: PubSub
): Promise<ResolvedVariantQueryResult> => {
  /* eslint-disable camelcase */
  let tokenResponse: AxiosResponse<{ access_token: string }>;

  if (process.env.TEST_NODE_OAUTH_ACTIVE === 'true') {
    try {
      tokenResponse = await axios.post(
        'https://ssmp-dev.us.auth0.com/oauth/token',
        {
          client_id: process.env.TEST_NODE_SSMP_TOKEN_CLIENT_ID,
          client_secret: process.env.TEST_NODE_SSMP_TOKEN_CLIENT_SECRET,
          audience: process.env.TEST_NODE_TOKEN_AUDIENCE,
          grant_type: 'client_credentials',
        },
        { headers: { 'content-type': 'application/json' } }
      );
    } catch (e) {
      logger.error(e);
      return {
        data: [],
        error: { code: 403, message: 'ERROR FETCHING OAUTH TOKEN' },
        source: 'remote-test',
      };
    }
  } else {
    tokenResponse = { data: { access_token: 'abc' } } as any;
  }

  let remoteTestNodeQueryResponse = null;
  let remoteTestNodeQueryError: RemoteTestNodeQueryError | null = null;

  try {
    remoteTestNodeQueryResponse = await axios.get(
      `http://test-node-1:9915/data?ensemblId=${args.input.gene.ensemblId}`,
      {
        headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` },
      }
    );
  } catch (e) {
    logger.error(e);
    remoteTestNodeQueryError = e as AxiosError;
  }

  // todo: wrap and make type safe
  pubsub.publish(QUERY_RESOLVED, { queryResolved: { node: 'remote-test' } });

  return {
    data: remoteTestNodeQueryResponse?.data,
    error: transformRemoteTestNodeErrorResponse(remoteTestNodeQueryError),
    source: 'remote-test',
  };
};

export const transformRemoteTestNodeErrorResponse: ErrorTransformer<AxiosError> = error => {
  if (!error) {
    return null;
  } else {
    return { code: error.response?.status || 500, message: error.response?.data };
  }
};

export default getRemoteTestNodeQuery;