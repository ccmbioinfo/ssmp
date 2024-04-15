import logger from '../../logger';
import {
  CADDAnnotationQueryResponse,
  CombinedVariantQueryResponse,
  GnomadAnnotationQueryResponse,
  QueryInput,
  SourceError,
  VariantQueryDataResult,
  VariantQueryResponse,
} from '../../types';
import getLocalQuery from './adapters/localQueryAdapter';
import getRemoteTestNodeQuery from './adapters/remoteTestNodeAdapter';
import fetchCaddAnnotations from './utils/fetchCaddAnnotations';
import annotateCadd from './utils/annotateCadd';
import fetchGnomadAnnotations from './utils/fetchGnomadAnnotations';
import annotateGnomad from './utils/annotateGnomad';
import { liftover } from './utils/liftOver';
import { QueryResponseError } from './utils/queryResponseError';
import getG4rdNodeQuery from './adapters/g4rdAdapter';
import { timeitAsync } from '../../utils/timeit';
import getCMHNodeQuery from './adapters/cmhAdapter';

const getVariants = async (parent: any, args: QueryInput): Promise<CombinedVariantQueryResponse> =>
  await resolveVariantQuery(args);

const isVariantQuery = (
  arg: VariantQueryResponse | CADDAnnotationQueryResponse | GnomadAnnotationQueryResponse
): arg is VariantQueryResponse =>
  arg.source !== 'CADD annotations' && arg.source !== 'gnomAD annotations';

const resolveVariantQuery = timeitAsync('resolveVariantQuery')(
  async (args: QueryInput): Promise<CombinedVariantQueryResponse> => {
    const {
      input: {
        sources,
        variant: { assemblyId },
        gene: { position },
      },
    } = args;

    let annotationPosition = position;

    // fetch data
    const queries = sources.map(source => buildSourceQuery(source, args));
    const settledQueries = await Promise.allSettled([...queries]);

    const errors: SourceError[] = [];
    const combinedResults: VariantQueryDataResult[] = [];

    /* inspect variant results and combine if no errors */
    settledQueries.forEach(response => {
      if (
        response.status === 'fulfilled' &&
        isVariantQuery(response.value) &&
        !response.value.error
      ) {
        combinedResults.push(...response.value.data);
      } else if (response.status === 'fulfilled' && !!response.value.error) {
        const message =
          process.env.NODE_ENV === 'production' && response.value.error.code === 500
            ? 'Something went wrong!'
            : response.value.error.message;

        errors.push({
          source: response.value.source,
          error: { ...response.value.error!, message },
        });
      } else if (response.status === 'rejected') {
        logger.error('UNHANDLED REJECTION!');
        logger.error(response.reason);
        throw new Error(response.reason);
      }
    });

    logger.debug(`${combinedResults.length} partipants found from queries`);

    // filter data that are not in user requested assemblyId
    const dataForLiftover = combinedResults.filter(v => v.variant.assemblyId !== assemblyId);
    // filter data that are already in user requested assemlbyId
    let dataForAnnotation = combinedResults.filter(v => {
      if (v.variant.assemblyId === assemblyId) {
        v.variant.assemblyIdCurrent = assemblyId;
        return true;
      } else return false;
    });
    let unliftedVariants: VariantQueryDataResult[] = [];

    // perform liftOver if needed
    if (dataForLiftover.length) {
      try {
        const liftoverResults = await liftover(dataForAnnotation, dataForLiftover, assemblyId);
        ({ unliftedVariants, dataForAnnotation, annotationPosition } = liftoverResults);
        // annotationPosition == "" if there's no data for annotation, which is fine
      } catch (err) {
        logger.error(JSON.stringify(err));
      }
    }

    // Cadd annotations for data in user requested assemblyId
    let data: VariantQueryDataResult[] = dataForAnnotation;

    // Only perform CADD and gnomAD annotations if there are variants to annotate
    if (data.length) {
      try {
        const { data: caddAnnotations } = await fetchCaddAnnotations(
          annotationPosition,
          assemblyId
        );

        data = annotateCadd(dataForAnnotation, caddAnnotations);
      } catch (err) {
        if (err instanceof QueryResponseError) {
          const { source, ...error } = err as QueryResponseError;

          errors.push({ source, error });
        }
      }

      try {
        const { data: gnomadAnnotations } = await fetchGnomadAnnotations(
          assemblyId,
          annotationPosition,
          data
        );

        data = annotateGnomad(dataForAnnotation, gnomadAnnotations);
      } catch (err) {
        if (err instanceof QueryResponseError) {
          const { source, ...error } = err;

          errors.push({ source, error });
        }
      }
    }

    // return unmapped variants if there's any
    if (unliftedVariants.length) {
      data = data.concat(unliftedVariants);
    }
    return { errors, data };
  }
);

const buildSourceQuery = timeitAsync('buildSourceQuery')(
  (source: string, args: QueryInput): Promise<VariantQueryResponse> => {
    switch (source) {
      case 'local':
        return getLocalQuery();
      case 'remote-test':
        return getRemoteTestNodeQuery(args);
      case 'g4rd':
        return getG4rdNodeQuery(args);
      case 'cmh':
        return getCMHNodeQuery(args);
      default:
        throw new Error(`source ${source} not found!`);
    }
  }
);

export default getVariants;
