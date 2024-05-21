import axios, { AxiosError, AxiosResponse } from 'axios';
import logger from '../../../logger';
import {
  ErrorTransformer,
  QueryInput,
  ResultTransformer,
  VariantQueryResponse,
} from '../../../types';
import { v4 as uuidv4 } from 'uuid';
import resolveAssembly from '../utils/resolveAssembly';

type RemoteTestNodeQueryError = AxiosError<string>;

/* eslint-disable camelcase */
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
  genotypes: {
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

/**
 * @param args VariantQueryInput
 * @returns  Promise<ResolvedVariantQueryResult>
 * Return some dummy data for testing and design purposes --> Currently returning from a "STAGER-like datastore" rather than a dummy data source, though this can be toggled
 */
const getRemoteTestNodeQuery = async (args: QueryInput): Promise<VariantQueryResponse> => {
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
    remoteTestNodeQueryResponse = await axios.get<StagerVariantQueryPayload[]>(
      `${process.env.TEST_NODE_URL}?geneName=${args.input.gene.geneName}`,
      {
        headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` },
      }
    );
  } catch (e) {
    logger.error(e);
    remoteTestNodeQueryError = e as RemoteTestNodeQueryError;
  }

  return {
    data: transformStagerQueryResponse(remoteTestNodeQueryResponse?.data || []),
    error: transformRemoteTestNodeErrorResponse(remoteTestNodeQueryError),
    source: 'remote-test',
  };
};

export const transformRemoteTestNodeErrorResponse: ErrorTransformer<
  RemoteTestNodeQueryError
> = error => {
  if (!error) {
    return undefined;
  } else {
    return {
      id: uuidv4(),
      code: error.response?.status || 500,
      message: JSON.stringify(error.response?.data),
    };
  }
};

export default getRemoteTestNodeQuery;

const transformStagerQueryResponse: ResultTransformer<StagerVariantQueryPayload[]> = response =>
  (response || []).map(r => ({
    source: 'remote-test',
    individual: {
      individualId: (r.genotypes || [{ participant_codename: 'unknown' }])[0].participant_codename,
    },
    variant: {
      alt: r.alt_allele,
      assemblyId: resolveAssembly('GRCh37'),
      callsets: r.genotypes.map(g => ({
        individualId: g.participant_codename,
        callsetId: g.analysis_id.toString(),
        info: {
          ad: g.alt_depths,
          burder: g.burden,
          zygosity: g.zygosity,
          geneName: r.gene,
        },
      })),
      end: r.position,
      ref: r.reference_allele,
      chromosome: r.chromosome,
      start: r.position,
      variantType: r.variation,
    },
    contactInfo: 'DrExample@stager.ca',
  }));
