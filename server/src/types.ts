/* eslint-disable camelcase */
import { Request, Response } from 'express';
import { Maybe } from 'graphql/jsutils/Maybe';

export interface VariantResponseInfoFields {
  aaChange?: Maybe<string>;
  af?: Maybe<number>;
  ac?: Maybe<number>;
  cdna?: Maybe<string>;
  consequence?: Maybe<string>;
  geneName?: Maybe<string>;
  gnomadHom?: Maybe<number>;
  phred?: Maybe<number>;
  spliceAIScore?: Maybe<number>;
  spliceAIType?: Maybe<string>;
  transcript?: Maybe<string>;
}

export interface CallsetInfoFields {
  ad?: Maybe<number>;
  dp?: Maybe<number>;
  gq?: Maybe<number>;
  qual?: Maybe<number>;
  zygosity?: Maybe<string>;
}

export interface CallSet {
  callsetId: string;
  individualId: string;
  info: CallsetInfoFields;
}

export type AssemblyId = 'gnomAD_GRCh37' | '38' | 'GRCh37' | 'GRCh38' | '37' | 'hg19' | 'hg38' | '';

export interface VariantResponseFields {
  alt: string;
  assemblyId: AssemblyId;
  assemblyIdCurrent?: AssemblyId;
  callsets: CallSet[];
  end: number;
  info?: VariantResponseInfoFields;
  ref: string;
  chromosome: string;
  start: number;
  variantId?: Maybe<string>;
  variantType?: Maybe<string>;
}

export interface AgeOfOnsetFields {
  age: Maybe<number>;
  ageGroup: Maybe<String>;
}

export interface PhenotypicFeaturesFields {
  ageOfOnset?: Maybe<AgeOfOnsetFields>;
  dateOfOnset?: Maybe<string>;
  levelSeverity?: Maybe<string>;
  onsetType?: Maybe<string>;
  phenotypeId?: Maybe<string>;
  phenotypeLabel?: Maybe<string>;
  observed?: Maybe<boolean>;
}

export interface DiseaseFields {
  ageOfOnset?: Maybe<AgeOfOnsetFields>;
  description?: Maybe<string>;
  diseaseId: string;
  diseaseLabel?: Maybe<string>;
  levelSeverity?: Maybe<string>;
  outcome?: Maybe<string>;
  stage?: Maybe<string>;
}

export interface Disorder {
  id: string;
  label: string;
}

type DisorderAffected = Pick<Disorder, 'label'>;

export interface IndividualInfoFields {
  candidateGene?: Maybe<string>;
  clinicalStatus?: Maybe<string>;
  disorders?: Maybe<Disorder[]>;
  solved?: Maybe<string>;
  classifications?: Maybe<string>;
  diagnosis?: Maybe<string>;
}

export interface IndividualResponseFields {
  diseases?: Maybe<DiseaseFields[]>;
  ethnicity?: Maybe<string>;
  familyId?: Maybe<string>;
  geographicOrigin?: Maybe<string>;
  individualId?: Maybe<string>;
  info?: Maybe<IndividualInfoFields>;
  phenotypicFeatures?: Maybe<PhenotypicFeaturesFields[]>;
  sex?: Maybe<string>;
}

export interface VariantQueryDataResult {
  contactInfo: string;
  individual: IndividualResponseFields;
  source: string;
  variant: VariantResponseFields;
}

export interface VariantQueryInput {
  assemblyId: AssemblyId;
  maxFrequency: number;
}

export interface GeneQueryInput {
  geneName: string;
  position: string;
}

export interface QueryInput {
  input: {
    sources: string[];
    gene: GeneQueryInput;
    variant: VariantQueryInput;
  };
}

/* end graphql schema types */

/* start OpenAPI schema types */

type OAQueryResponseResult = Omit<VariantQueryDataResult, 'source'>;

export interface OAQueryResponse {
  exists: boolean;
  numTotalResults: number;
  results: OAQueryResponseResult[];
}

/* end OpenAPI Schema types */

/* G4RD POST variants/match endpoint schema */
export interface G4RDVariantQueryResult {
  exists: boolean;
  numTotalResults: number;
  results: {
    contactInfo: string;
    individual: IndividualResponseFields;
    variant: VariantResponseFields;
  }[];
}

export type PTVariantArray = {
  individualIds: string[];
  variant: VariantResponseFields;
}[];

export interface PTPaginatedVariantQueryResult {
  page: number;
  limit: number;
  exists: boolean;
  numTotalResults: number;
  results: PTVariantArray;
}

/* G4RD GET patients endpoint schema */
// https://docs.phenotips.com/reference/fetchpatients-1
export interface Contact {
  institution?: string;
  name?: string;
  id?: string;
  email?: string;
}
export interface Ethnicity {
  maternal_ethnicity?: string[];
  paternal_ethnicity?: string[];
}
export interface Gene {
  comments?: string;
  gene?: string;
  id?: string;
  strategy?: string[];
  status?: string;
}
export interface Notes {
  family_history?: string;
  prenatal_development?: string;
  indication_for_referral?: string;
  genetic_notes?: string;
  medical_history?: string;
  diagnosis_notes?: string;
}
export interface Solved {
  status: 'solved' | 'unsolved' | '';
}
export interface FeatureQualifier {
  id?: string;
  label?: string;
  type?: // these types are the "accepted options" according to the docs
  | 'age_of_onset'
    | 'laterality'
    | 'pace_of_progression'
    | 'severity'
    | 'spatial_pattern'
    | 'temporal_pattern'
    | string;
}
export interface Feature {
  id?: string;
  label?: string;
  type?: string; // "should be 'phenotype'"
  observed?: string; // may be 'yes' or 'no' or empty
  notes?: string;
  qualifiers?: FeatureQualifier[];
}
export interface NonStandardFeature {
  id?: undefined; // does not occur; used for type guarding
  label?: string;
  categories?: { id?: string; label?: string }[];
  type?: string; // "should be 'phenotype'"
  observed?: string; // may be 'yes' or 'no' or empty
}
export interface G4RDPatientQueryResult {
  notes: Notes;
  ethnicity: Ethnicity;
  clinicalStatus?: string;
  disorders: [DisorderAffected, ...Disorder[]];
  id: string;
  genes?: Gene[];
  solved?: Solved;
  features?: Feature[];
  nonstandard_features?: NonStandardFeature[];
  contact?: {
    name: string;
    id: string;
  }[];
  sex?: Maybe<string>;
}

/* End of G4RD GET patients endpoint schema */

/* G4RD GET family endpoint schema */
export interface G4RDFamilyQueryResult {
  id: string;
}

export interface VariantCoordinate {
  alt: string;
  chrom: string;
  ref: string;
  pos: number;
}

// Very specific type so that it can be put into a mongo.aggregate under "$or:"
// CMH indels use "-" unlike G4RD, so we compare $ref[1:] or $alt[1:] to ref or alt in CMH respectively
// '$ref' for deletions, '$alt' for insertions (ie. which one has more nucleotides)
export interface CMHVariantIndelCoordinate<T extends '$ref' | '$alt'> {
  $expr: {
    $eq: [{ $substrCP: [T, 1, { $strLenCP: T }] }, string];
  };
  pos: number;
  chrom: string;
}

export interface CaddAnnotation extends VariantCoordinate {
  aaAlt: string;
  aaPos: string;
  aaRef: string;
  cdsPos: string;
  consequence: string;
  consScore: number;
  phred: number;
  spliceAIScore: number;
  spliceAIType: string;
  transcript: string;
}

export interface GnomadBaseAnnotation extends VariantCoordinate {
  af: number;
  nhomalt: number;
}

export interface GnomadGRCh37ExomeAnnotation extends GnomadBaseAnnotation {
  an: number;
}

export interface GnomadGenomeAnnotation extends GnomadBaseAnnotation {
  ac: number;
}

export interface GnomadAnnotations {
  primaryAnnotations: (GnomadGRCh37ExomeAnnotation | GnomadGenomeAnnotation)[];
  secondaryAnnotations: GnomadGenomeAnnotation[];
}

interface ErrorResponse {
  id: string;
  code: number | string;
  message?: string | null;
}

export interface QueryResult<T> {
  source: string;
  data: T;
  error?: ErrorResponse;
}

export type VariantQueryResponse = QueryResult<VariantQueryDataResult[]>;
export type CADDAnnotationQueryResponse = QueryResult<CaddAnnotation[]>;
export type GnomadAnnotationQueryResponse = QueryResult<GnomadAnnotations>;

export interface SourceError {
  source: string;
  error: ErrorResponse;
}

export interface CombinedVariantQueryResponse {
  data: VariantQueryDataResult[];
  errors: SourceError[];
}

export interface GqlContext {
  req: Request;
  res: Response;
}

export type ResultTransformer<T> = (model: T, ...args: any[]) => VariantQueryDataResult[];

export type ErrorTransformer<T> = (model: T | null) => ErrorResponse | undefined;

export enum Assembly {
  GRCh37 = 37,
  hg19 = 37,
  GRCh38 = 38,
  hg38 = 38,
}
