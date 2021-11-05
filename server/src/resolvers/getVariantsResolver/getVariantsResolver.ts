import logger from '../../logger';
// import { v4 as uuidv4 } from 'uuid';
import {
  AnnotationQueryResponse,
  CombinedVariantQueryResponse,
  QueryInput,
  VariantAnnotation,
  VariantQueryResponse,
} from '../../types';
import getLocalQuery from './adapters/localQueryAdapter';
import getRemoteTestNodeQuery from './adapters/remoteTestNodeAdapter';
import fetchAnnotations from './utils/fetchAnnotations';
import annotate from './utils/annotate';
import { VariantAnnotation as VariantAnnotationModel } from '../../models';

const getVariants = async (parent: any, args: QueryInput): Promise<CombinedVariantQueryResponse> =>
  await resolveVariantQuery(args);

/**
 *  typeguard: is this a variant query or an annotation query
 */
const isVariantQuery = (
  arg: VariantQueryResponse | AnnotationQueryResponse
): arg is VariantQueryResponse => arg.source !== 'annotations';

const resolveVariantQuery = async (args: QueryInput): Promise<CombinedVariantQueryResponse> => {
  const {
    input: {
      sources,
      variant: { assemblyId },
      gene: { position },
    },
  } = args;

  const annotationsPromise = fetchAnnotations(position, assemblyId);

  const gnomadAnnotations = await VariantAnnotationModel.getAnnotations(position, 'gnomAD_GRCh37');

  const queries = sources.map(source => buildSourceQuery(source, args));

  const settled = await Promise.allSettled([annotationsPromise, ...queries]);

  const annotations = settled.find(
    res => res.status === 'fulfilled' && !isVariantQuery(res.value)
  ) as PromiseFulfilledResult<AnnotationQueryResponse>;

  return settled.reduce<CombinedVariantQueryResponse>(
    (a, c) => {
      if (c.status === 'fulfilled' && isVariantQuery(c.value) && !c.value.error) {
        const { data, source } = c.value;

        if (gnomadAnnotations) {
          a.data.push({
            data: annotate(data, gnomadAnnotations),
            source,
          });
        }

        if (annotations) {
          a.data.push({
            data: annotate(data, annotations.value.data as VariantAnnotation[]),
            source,
          });
        } else {
          a.data.push({ data, source });
        }
      } else if (c.status === 'fulfilled' && !!c.value.error) {
        const message =
          process.env.NODE_ENV === 'production' && c.value.error.code === 500
            ? 'Something went wrong!'
            : c.value.error.message;

        a.errors.push({
          source: c.value.source,
          error: { ...c.value.error!, message },
        });
      } else if (c.status === 'rejected') {
        logger.error('UNHANDLED REJECTION!');
        logger.error(c.reason);
        throw new Error(c.reason);
      }
      return a;
    },
    {
      errors: [],
      data: [],
    }
  );
};

const buildSourceQuery = (source: string, args: QueryInput): Promise<VariantQueryResponse> => {
  switch (source) {
    case 'local':
      return getLocalQuery();
    case 'remote-test':
      return getRemoteTestNodeQuery(args);
    default:
      throw new Error(`source ${source} not found!`);
  }
};

export default getVariants;
