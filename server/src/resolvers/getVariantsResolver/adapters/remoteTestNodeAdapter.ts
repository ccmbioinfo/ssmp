import axios, { AxiosError, AxiosResponse } from 'axios';
import { PubSub } from 'graphql-subscriptions';
import { QUERY_RESOLVED } from '../..';
import logger from '../../../logger';
import {
  ErrorTransformer,
  QueryInput,
  ResolvedVariantQueryResult,
  ResultTransformer,
} from '../../../types';
import { v4 as uuidv4 } from 'uuid';

type RemoteTestNodeQueryError = AxiosError;

type StagerNodeQueryError = AxiosError;

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
        process.env.TEST_NODE_SSMP_TOKEN_ENDPOINT!,
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
        error: { code: 403, message: 'ERROR FETCHING OAUTH TOKEN', id: uuidv4() },
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
      `${process.env.TEST_NODE_URL}?ensemblId=${args.input.gene.ensemblId}`,
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
    data: remoteTestNodeQueryResponse?.data || [],
    error: transformRemoteTestNodeErrorResponse(remoteTestNodeQueryError),
    source: 'remote-test',
  };
};

export const transformRemoteTestNodeErrorResponse: ErrorTransformer<AxiosError> = error => {
  if (!error) {
    return null;
  } else {
    return {
      id: uuidv4(),
      code: error.response?.status || 500,
      message: error.response?.data,
    };
  }
};

export default getRemoteTestNodeQuery;

interface StagerVariantQueryPayload {
  aa_position: number;
  alt_allele: string;
  analysis_id: number;
  cadd_score: number;
  chromosome: string;
  clinvar: string;
  conserved_in_20_mammals: string;
  depth: number;
  end: number;
  ensembl_id: number;
  ensembl_transcript_id: string;
  exac_pli_score: number;
  exac_pnull_score: number;
  exac_prec_score: number;
  exon: string;
  gene: string;
  genotype: {
    alt_depths: number;
    analysis_id: number;
    burden: number;
    coverage: number;
    dataset_id: number;
    genotype: string;
    participant_codename: string;
    variant_id: number;
    zygosity: string;
  }[];
  gerp_score: string;
  gnomad_ac: number;
  gnomad_af: number;
  gnomad_af_popmax: number;
  gnomad_hom: number;
  gnomad_link: string;
  gnomad_oe_lof_score: number;
  gnomad_oe_mis_score: number;
  imprinting_expressed_allele: string;
  imprinting_status: string;
  info: string;
  name: string;
  number_of_callers: number;
  old_multiallelic: string;
  polyphen_score: string;
  position: number;
  protein_domains: string;
  pseudoautosomal: boolean;
  quality: number;
  reference_allele: string;
  report_ensembl_gene_id: string;
  revel_score: string;
  rsids: string;
  sift_score: string;
  source: string;
  spliceai_impact: string;
  spliceai_score: string;
  start: number;
  uce_100bp: number;
  uce_200bp: number;
  ucsc_link: string;
  variant_id: number;
  variation: string;
  vest3_score: string;
}

const transformStagerQueryResponse: ResultTransformer<StagerVariantQueryPayload[]> = response => {
  if (!response) {
    return [];
  } else {
    return response.map(r => ({
      individual: {
        individualId: (r.genotype || [{}])[0].participant_codename,
      },
      variant: {
        alt: r.alt_allele,
        assemblyId: 'GRCh37',
        callsets: r.genotype.map(g => ({
          individualId: g.participant_codename,
          datasetId: g.dataset_id,
          callSetId: g.analysis_id.toString(),
          info: {
            ad: g.alt_depths,
            zygosity: g.zygosity,
          },
        })),
        end: r.end,
        ref: r.reference_allele,
        refSeqId: r.chromosome,
        start: r.start,
        variantType: r.variation,
      },
      contactInfo: 'DrExample@stager.ca',
    }));
  }
};

/**
 * @param args VariantQueryInput
 * @returns  Promise<ResolvedVariantQueryResult>
 * Return some dummy data for testing and design purposes
 */
export const getStagerNodeQuery = async (
  args: QueryInput,
  pubsub: PubSub
): Promise<ResolvedVariantQueryResult> => {
  /* eslint-disable camelcase */
  let tokenResponse: AxiosResponse<{ access_token: string }>;

  if (process.env.TEST_NODE_OAUTH_ACTIVE === 'true') {
    try {
      tokenResponse = await axios.post(
        process.env.TEST_NODE_SSMP_TOKEN_ENDPOINT!,
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
        error: { code: 403, message: 'ERROR FETCHING OAUTH TOKEN', id: uuidv4() },
        source: 'remote-test',
      };
    }
  } else {
    tokenResponse = { data: { access_token: 'abc' } } as any;
  }

  let stagerNodeQueryResponse = null;
  let stagerNodeQueryError: StagerNodeQueryError | null = null;

  logger.debug(
    `${process.env.STAGER_NODE_URL}/summary/variants?genes=${args.input.gene.ensemblId}`
  );

  try {
    stagerNodeQueryResponse = await axios.get<StagerVariantQueryPayload[]>(
      `${process.env.STAGER_NODE_URL}/summary/variants?genes=${args.input.gene.ensemblId}`,
      {
        headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` },
      }
    );
  } catch (e) {
    logger.error(e);
    stagerNodeQueryError = e as AxiosError;
  }

  return {
    data: transformStagerQueryResponse(stagerNodeQueryResponse?.data || []),
    error: transformStagerNodeErrorResponse(stagerNodeQueryError),
    source: 'stager',
  };
};

export const transformStagerNodeErrorResponse: ErrorTransformer<AxiosError> = error => {
  if (!error) {
    return null;
  } else {
    logger.error(error);
    return {
      id: uuidv4(),
      code: error.response?.status || 500,
      message: error.message,
    };
  }
};
