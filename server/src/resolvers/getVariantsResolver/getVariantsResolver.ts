import logger from '../../logger';
import {
  CADDAnnotationQueryResponse,
  CombinedVariantQueryResponse,
  QueryInput,
  SourceError,
  VariantQueryDataResult,
  VariantQueryResponse,
} from '../../types';
import getLocalQuery from './adapters/localQueryAdapter';
import getRemoteTestNodeQuery from './adapters/remoteTestNodeAdapter';
import fetchCaddAnnotations from './utils/fetchCaddAnnotations';
import annotateCadd from './utils/annotateCadd';
import annotateGnomad from './utils/annotateGnomad';
import liftover from './utils/liftOver';
import getG4rdNodeQuery from './adapters/g4rdAdapter';
import { SlurmApi } from '../../slurm';

const slurm = new SlurmApi();

const getVariants = async (parent: any, args: QueryInput): Promise<CombinedVariantQueryResponse> =>
  await resolveVariantQuery(args);

const isVariantQuery = (
  arg: VariantQueryResponse | CADDAnnotationQueryResponse
): arg is VariantQueryResponse => arg.source !== 'CADD annotations';

const resolveVariantQuery = async (args: QueryInput): Promise<CombinedVariantQueryResponse> => {
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

  // Send dummy hello world
  const [start, end] = annotationPosition.replace(/.+:/, '').split('-');
  const size = +end - +start;
  if (size > 600000){
    const submittedJob = await slurm.slurmctldSubmitJob({
      script: "#!/bin/bash echo 'Hello World!'",
    },
    {
      baseURL: `${process.env.SLURM_ENDPOINT}slurm/v0.0.37`,
      // headers: { 'Authorization': `Bearer ${process.env.SLURM_JWT!}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      headers: {
        'X-SLURM-USER-NAME': process.env.SLURM_USER!,
        'X-SLURM-USER-TOKEN': process.env.SLURM_JWT!
      }
    })
    console.log('SUBMITTED JOB:', submittedJob);
  }
  

  

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
    const liftoverResults = await liftover(dataForAnnotation, dataForLiftover, assemblyId);
    ({ unliftedVariants, dataForAnnotation, annotationPosition } = liftoverResults);
  }

  // Cadd annotations for data in user requested assemblyId
  let data: VariantQueryDataResult[] = dataForAnnotation;
  const caddAnnotationsPromise = fetchCaddAnnotations(annotationPosition, assemblyId);
  const settledCadd = await Promise.allSettled([caddAnnotationsPromise]);
  const caddAannotations = settledCadd.find(
    res => res.status === 'fulfilled' && !isVariantQuery(res.value)
  ) as PromiseFulfilledResult<CADDAnnotationQueryResponse>;

  if (!!caddAannotations && !caddAannotations.value.error) {
    data = annotateCadd(dataForAnnotation, caddAannotations.value.data);
  }

  // gnomAD annotations TODO: gnomAD annotations for GRCh38 are not available yet.
  if (assemblyId === 'GRCh37') {
    data = await annotateGnomad(data ?? dataForAnnotation);
  }

  // return unmapped variants if there's any
  if (unliftedVariants.length) {
    data = data.concat(unliftedVariants);
  }
  return { errors, data };
};

const buildSourceQuery = (source: string, args: QueryInput): Promise<VariantQueryResponse> => {
  switch (source) {
    case 'local':
      return getLocalQuery();
    case 'remote-test':
      return getRemoteTestNodeQuery(args);
    case 'g4rd':
      return getG4rdNodeQuery(args);
    default:
      throw new Error(`source ${source} not found!`);
  }
};

export default getVariants;
