import mongoose from 'mongoose';
const variantAnnotationSchema = new mongoose.Schema(
  {
    alt: {
      type: String
    },
    ref: {
      type: String
    },
    chr: {
      type: String
    },
    assembly: {
      type: String
    },
    aa_changes: {
      type: String
    },
    cdna: {
      type: String
    },
    gene_name: {
      type: String
    },
    gnomad_het: {
      type: Number
    },
    gnomad_hom: {
      type: Number
    },
    transcript: {
      type: String
    }
  }
);
const VariantAnnotation = mongoose.model('VariantAnnotation', variantAnnotationSchema);
export default VariantAnnotation;
