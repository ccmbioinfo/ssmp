import mongoose, { Model, model } from 'mongoose';
import logger from '../logger';
import {
  AssemblyId,
  CMHVariantIndelCoordinate,
  GnomadBaseAnnotation,
  GnomadGenomeAnnotation,
  GnomadGRCh37ExomeAnnotation,
  VariantCoordinate,
} from '../types';

type AnnotationInput = {
  start: number;
  end: number;
  coordinates: VariantCoordinate[];
};

interface GnomadAnnotations<T> {
  primaryAnnotations: T[];
  secondaryAnnotations: GnomadGenomeAnnotation[];
}

interface GnomadAnnotationStaticMethods<T> {
  getAnnotations(ids: AnnotationInput): Promise<GnomadAnnotations<T>>;
}

type GnomadGRCh37ExomeAnnotationModel = Model<GnomadGRCh37ExomeAnnotation> &
  GnomadAnnotationStaticMethods<GnomadGRCh37ExomeAnnotation>;
type GnomadGenomeAnnotationModel = Model<GnomadGenomeAnnotation> &
  GnomadAnnotationStaticMethods<GnomadGenomeAnnotation>;

const gnomadAnnotationBaseSchema = new mongoose.Schema<
  GnomadBaseAnnotation,
  Model<GnomadBaseAnnotation>
>({
  chrom: {
    type: String,
  },
  pos: {
    type: Number,
  },
  ref: {
    type: String,
  },
  alt: {
    type: String,
  },
  nhomalt: {
    type: Number,
  },
  af: {
    type: Number,
  },
});

const gnomadGenomeBaseSchema = new mongoose.Schema<
  GnomadGenomeAnnotation,
  Model<GnomadGenomeAnnotation>
>({
  ...gnomadAnnotationBaseSchema.obj,
  ac: {
    type: Number,
  },
});

const GnomadGRCh37AnnotationSchema = new mongoose.Schema<
  GnomadGRCh37ExomeAnnotation,
  GnomadGRCh37ExomeAnnotationModel
>({
  ...gnomadAnnotationBaseSchema.obj,
  an: {
    type: Number,
  },
});

const GnomadGRCh37GenomeAnnotationSchema = new mongoose.Schema<
  GnomadGenomeAnnotation,
  GnomadGenomeAnnotationModel
>({ ...gnomadGenomeBaseSchema.obj });

const GnomadGRCh38AnnotationSchema = new mongoose.Schema<
  GnomadGenomeAnnotation,
  GnomadGenomeAnnotationModel
>({ ...gnomadGenomeBaseSchema.obj });

const getAnnotations = async (
  model: GnomadGenomeAnnotationModel | GnomadGRCh37ExomeAnnotationModel,
  ids: AnnotationInput,
  omittedFields: string[] = []
) => {
  const { start, end, coordinates } = ids;

  if (!coordinates.length) return [];

  // Check and modify coordinates to fit gnomAD model
  // CMH uses "-" in ref/alt fields for insertions/deletions respectively, gnomAD doesn't
  const cmhInsertions: CMHVariantIndelCoordinate<'$alt'>[] = [];
  const cmhDeletions: CMHVariantIndelCoordinate<'$ref'>[] = [];
  const normalCoords: VariantCoordinate[] = [];
  coordinates.forEach(coord => {
    if (coord.alt === '-') {
      // CMH deletion
      cmhDeletions.push({
        $expr: {
          $eq: [{ $substrCP: ['$ref', 1, { $strLenCP: '$ref' }] }, coord.ref],
        },
        pos: coord.pos - 1, // cmh 'start' is +1 compared to gnomad
        chrom: coord.chrom,
      });
    } else if (coord.ref === '-') {
      // CMH insertion
      cmhInsertions.push({
        $expr: {
          $eq: [{ $substrCP: ['$alt', 1, { $strLenCP: '$alt' }] }, coord.alt],
        },
        pos: coord.pos,
        chrom: coord.chrom,
      });
    } else {
      normalCoords.push(coord);
    }
  });

  // don't worry about the types
  const coordinateStage: { $match: { $or: any[] } } = {
    $match: {
      $or: [
        ...normalCoords, // normal coordinates
      ],
    },
  };

  // Don't need to add match for CMH coordinates if there aren't any
  if (cmhInsertions.length > 0 || cmhDeletions.length > 0) {
    // we assume that ref[0] == alt[0] in gnomAD
    coordinateStage.$match.$or = coordinateStage.$match.$or.concat([
      ...cmhInsertions,
      ...cmhDeletions,
    ]);
  }

  const results = await model.aggregate([
    { $match: { pos: { $gte: Math.max(start - 1, 0), $lte: end } } },
    coordinateStage,
    {
      $project: Object.fromEntries([...omittedFields, '_id', 'assembly', 'type'].map(f => [f, 0])),
    },
  ]);
  return results;
};

GnomadGRCh37AnnotationSchema.statics.getAnnotations = async function (ids: AnnotationInput) {
  const exomeAnnotations = await getAnnotations(this, ids, [
    'cdna',
    'filter',
    'gene',
    'transcript',
  ]);
  const genomeAnnotations = await getAnnotations(getGnomadGRCh37GenomeAnnotationModel(), ids, [
    'cdna',
    'gene',
    'source',
    'transcript',
  ]);

  logger.debug(
    `${exomeAnnotations.length} GRCh37 exome gnomAD annotation${
      exomeAnnotations.length === 1 ? '' : 's'
    } found`
  );
  logger.debug(
    `${genomeAnnotations.length} GRCh37 genome gnomAD annotation${
      genomeAnnotations.length === 1 ? '' : 's'
    } found`
  );

  return {
    primaryAnnotations: exomeAnnotations,
    secondaryAnnotations: genomeAnnotations,
  };
};

GnomadGRCh38AnnotationSchema.statics.getAnnotations = async function (ids: AnnotationInput) {
  const genomeAnnotations = await getAnnotations(this, ids, ['source']);

  logger.debug(
    `${genomeAnnotations.length} GRCh38 genome gnomAD annotation${
      genomeAnnotations.length === 1 ? '' : 's'
    } found`
  );

  return {
    primaryAnnotations: genomeAnnotations,
    secondaryAnnotations: [],
  };
};

const getGnomadGRCh37GenomeAnnotationModel = () =>
  model<GnomadGenomeAnnotation, GnomadGenomeAnnotationModel>(
    'GnomadGRCh37GenomeAnnotation',
    GnomadGRCh37GenomeAnnotationSchema,
    'GRCh37GenomeAnnotations'
  );

export const getGnomadAnnotationModel = (assembly: AssemblyId, chromosome: string) => {
  chromosome = chromosome.replace('chr', '');
  if (assembly.includes('38')) {
    // GRCh38
    if ([...Array.from({ length: 22 }, (_, i) => `${i + 1}`), 'X', 'Y'].includes(chromosome)) {
      return model<GnomadGenomeAnnotation, GnomadGenomeAnnotationModel>(
        `GnomadGRCh38GenomeAnnotation_chr${chromosome}`,
        GnomadGRCh38AnnotationSchema,
        `GRCh38GenomeAnnotations_chr${chromosome}`
      );
    } else {
      throw Error(`Chromosome '${chromosome}' invalid; cannot fetch Gnomad annotation model`);
    }
  } else {
    // GRCh37
    return model<GnomadGRCh37ExomeAnnotation, GnomadGRCh37ExomeAnnotationModel>(
      'GnomadGRCh37ExomeAnnotation',
      GnomadGRCh37AnnotationSchema,
      'GRCh37ExomeAnnotations'
    );
  }
};
