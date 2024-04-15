import { promises } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { AssemblyId, VariantQueryDataResult } from '../../../types';
import { timeitAsync } from '../../../utils/timeit';
const exec = require('util').promisify(require('child_process').exec);

type Position = { chromosome: string; start: number; end: number };

const createTmpFile = async () => {
  const dir = await promises.mkdtemp(path.join(tmpdir(), 'liftover-'));
  return path.join(dir, 'temp');
};

// Get start positions of lifted variants.
const parseBedStart = (bed: String) =>
  bed
    .split('\n')
    .filter(l => !!l && !l.startsWith('#'))
    .map(v => v.split('\t')[1]);

// Get end positions of lifted variants.
const parseBedEnd = (bed: String) =>
  bed
    .split('\n')
    .filter(l => !!l && !l.startsWith('#'))
    .map(v => v.split('\t')[2]);

/**
 * Function wrapper for running liftOver with generic positions.
 *
 * @param positions List of positions. Do not convert to BED format in advance.
 * @param desiredAssemblyId Desired assembly ID to convert to. Assumes conversion between hg19 and hg38.
 *
 * @returns Object containing lifted and unlifted positions, converted from BED format to position format.
 */
const _runLiftOver = async (positions: Position[], desiredAssemblyId: AssemblyId) => {
  // Convert variants from JSON format to BED format.
  // Note that position format is 1-based and BED format is half-open 0-based: https://genome.ucsc.edu/FAQ/FAQformat.html#format1
  const bedstring = positions
    .map(
      v =>
        `${v.chromosome.startsWith('chr') ? v.chromosome : 'chr' + v.chromosome}\t${v.start - 1}\t${
          v.end
        }`
    )
    .join('\n');
  const lifted = await createTmpFile();
  const unlifted = await createTmpFile();
  const bedfile = await createTmpFile();
  await promises.writeFile(bedfile, bedstring);

  let chain: string;
  if (desiredAssemblyId.includes('38')) {
    chain = '/home/node/hg19ToHg38.over.chain';
  } else {
    chain = '/home/node/hg38ToHg19.over.chain';
  }

  const liftOverCommand = `liftOver ${bedfile} ${chain} ${lifted} ${unlifted}`;
  try {
    await exec(liftOverCommand);
    const _liftedVars = await promises.readFile(lifted);
    const _unliftedVars = await promises.readFile(unlifted);
    const liftedVars = parseBedStart(_liftedVars.toString());
    const unliftedVars = parseBedStart(_unliftedVars.toString());
    const liftedVarsEnd = parseBedEnd(_liftedVars.toString());
    const unliftedVarsEnd = parseBedEnd(_unliftedVars.toString());

    return {
      lifted: liftedVars.map((start, i) => ({
        start: Number(start) + 1,
        end: Number(liftedVarsEnd[i]),
      })),
      unlifted: unliftedVars.map((start, i) => ({
        start: Number(start) + 1,
        end: Number(unliftedVarsEnd[i]),
      })),
    };
  } finally {
    promises.rm(lifted, { force: true });
    promises.rm(unlifted, { force: true });
    promises.rm(bedfile, { force: true });
  }
};

const liftover = timeitAsync('liftover')(
  async (
    dataForAnnotation: VariantQueryDataResult[],
    dataForLiftover: VariantQueryDataResult[],
    assemblyIdInput: AssemblyId
  ) => {
    try {
      const positions: Position[] = dataForLiftover.map(v => ({
        chromosome: v.variant.chromosome,
        start: v.variant.start,
        end: v.variant.end,
      }));
      const { lifted: liftedVars, unlifted: unliftedVars } = await _runLiftOver(
        positions,
        assemblyIdInput
      );

      const unliftedMap: { [key: string]: boolean } = unliftedVars.reduce(
        (acc, curr) => ({ ...acc, [curr.start]: true }),
        {}
      );
      const unliftedVariants: VariantQueryDataResult[] = [];

      // Merge lifted variants with dataForAnnotation. Filter unmapped variants.
      dataForLiftover.forEach((v, i) => {
        if (unliftedMap[v.variant.start.toString()]) {
          v.variant.assemblyIdCurrent = v.variant.assemblyId;
          unliftedVariants.push(v);
        } else {
          v.variant.start = Number(liftedVars[i].start); // Convert from BED format to position format.
          v.variant.end = Number(liftedVars[i].end);
          v.variant.assemblyIdCurrent = assemblyIdInput;
          dataForAnnotation.push(v);
        }
      });

      // Compute the annotation position for the variants that are in user's requested assembly.
      let geneStart = Infinity;
      let geneEnd = 0;
      dataForAnnotation.forEach(result => {
        if (result.variant.start < geneStart) {
          geneStart = result.variant.start;
        }
        if (result.variant.end > geneEnd) {
          geneEnd = result.variant.end;
        }
      });

      let annotationPosition = '';
      if (dataForAnnotation.length > 0)
        annotationPosition = `${dataForAnnotation[0].variant.chromosome}:${geneStart}-${geneEnd}`;

      return { dataForAnnotation, unliftedVariants, annotationPosition };
    } catch (e) {
      console.error(e);
      return { dataForAnnotation, unliftedVariants: [], annotationPosition: '' };
    }
  }
);

const liftoverOne = timeitAsync('liftoverOne')(
  async (position: Position, desiredAssemblyId: AssemblyId, currentAssemblyId: AssemblyId) => {
    // skip if both IDs are the same
    if (desiredAssemblyId.includes('38') === currentAssemblyId.includes('38')) {
      return { start: position.start, end: position.end };
    }

    const { lifted, unlifted } = await _runLiftOver([position], desiredAssemblyId);
    return [lifted, unlifted].flat()[0];
  }
);

export { liftover, liftoverOne };
