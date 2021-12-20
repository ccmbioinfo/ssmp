import resolveAssembly from './resolveAssembly';
import resolveChromosome from './resolveChromosome';
import { v4 as uuidv4 } from 'uuid';
import { CADDAnnotationQueryResponse, CaddAnnotation } from '../../../types';
import { TabixIndexedFile } from '@gmod/tabix';
import { RemoteFile, Fetcher } from 'generic-filehandle';
import fetch from 'cross-fetch';

const ANNOTATION_URL_38 =
  'https://krishna.gs.washington.edu/download/CADD/v1.6/GRCh38/whole_genome_SNVs_inclAnno.tsv.gz';
const ANNOTATION_URL_37 =
  'https://krishna.gs.washington.edu/download/CADD/v1.6/GRCh37/whole_genome_SNVs_inclAnno.tsv.gz';

const INDEX_37_PATH = '/home/node/cadd_wgs_ghr37_index.gz.tbi';
const INDEX_38_PATH = '/home/node/cadd_wgs_ghr38_index.gz.tbi';

/**
 * The function queries CADD annotation TSV and returns a list of string, each of which represents one line in the TSV.
 * @param position: the variant coordinates. Has the format [chromosome]:[start]-[end] (e.g. 19:12345-67890)
 * @param assemblyId: version of the human reference genome. Can be "hg38", "hg19", "GRCh38", or "GRCh37".
 * @returns a list of strings, each of which contains information for one variant annotation.
 */

const _getAnnotations = async (position: string, assemblyId: string) => {
  const resolvedAssemblyId = resolveAssembly(assemblyId);
  const annotationUrl = resolvedAssemblyId === '38' ? ANNOTATION_URL_38 : ANNOTATION_URL_37;
  const indexPath = resolvedAssemblyId === '38' ? INDEX_38_PATH : INDEX_37_PATH;

  const tbiIndexed = new TabixIndexedFile({
    filehandle: new RemoteFile(annotationUrl, { fetch: fetch as Fetcher }),
    tbiPath: indexPath,
  });

  const { chromosome, start, end } = resolveChromosome(position);

  const lines: string[] = [];
  if (chromosome && start && end) {
    await tbiIndexed.getLines(`${chromosome}`, Number(start) - 1, Number(end) + 1, line => {
      lines.push(line);
    });
  }

  return lines;
};

/**
 * Takes in tabix query response and adapts it to @typedef CaddAnnotation
 * @param annotations: a list of tab-delimited strings from CADD annotation TSV.
 * Indexes for headers in the annotation TSV can be found at https://cadd.gs.washington.edu/static/ReleaseNotes_CADD_v1.6.pdf.
 *  Chrom: 1
    Pos: 2
    Ref: 3
    Alt: 4
    Consequence: 8
    oAA: 17
    nAA: 18
    FeatureID: 20
    cDNApos: 25
    protpos: 29
  *
 * @returns an array of JSON of @typedef CaddAnnotation
 */

const _formatAnnotations = (annotations: string[]) => {
  const headersMap: Record<number, keyof CaddAnnotation> = {
    0: 'chrom',
    1: 'pos',
    2: 'ref',
    3: 'alt',
    7: 'consequence',
    16: 'aaRef',
    17: 'aaAlt',
    19: 'transcript',
    24: 'cdna',
    28: 'aaPos',
  };

  const headersIndex = Object.keys(headersMap);
  const headers = Object.values(headersMap);

  const result = annotations.map(annotation => {
    // Get only the required annotation columns
    const annotationColumns = annotation
      .split('\t')
      .filter((a, i) => headersIndex.some(headerId => Number(headerId) === i));
    return Object.fromEntries(
      headers.map((h, i) => [h, annotationColumns[i]])
    ) as unknown as CaddAnnotation;
  });

  return result;
};

const fetchAnnotations = (
  position: string,
  assemblyId: string
): Promise<CADDAnnotationQueryResponse> => {
  const source = 'CADD annotations';
  const [start, end] = position.replace(/.+:/, '').split('-');
  const size = +end - +start;
  if (size > 600000) {
    return Promise.resolve({
      error: {
        id: uuidv4(),
        code: 422,
        message: `Gene of size ${size.toLocaleString()}bp is too large to annotate with VEP. Annotating with gnomAD only!`,
      },
      source,
      data: [],
    });
  } else {
    return _getAnnotations(position, assemblyId)
      .then(result => ({ source, data: _formatAnnotations(result) }))
      .catch(error => ({
        error: {
          id: uuidv4(),
          code: 500,
          message: `Error fetching annotations: ${error}`,
        },
        source,
        data: [],
      }));
  }
};

export default fetchAnnotations;
