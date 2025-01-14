import { CaddAnnotation, VariantQueryDataResult } from '../../../types';
import AMINO_ACID_MAPPING from '../../../constants/aminoAcidMapping';
import { timeit } from '../../../utils/timeit';

const annotate = timeit('annotateCadd')(
  (
    queryResponse: VariantQueryDataResult[],
    annotationResponse: CaddAnnotation[]
  ): VariantQueryDataResult[] => {
    const annotationKeys: Record<string, CaddAnnotation> = {};

    /** Choose the variant annotation with the highest consScore to prioritize annotation of the most deleterious transcript.
  All consequence terms in CADD annotations can be found at https://cadd.gs.washington.edu/static/ReleaseNotes_CADD_v1.3.pdf
  For reference, the order of severity of the consequences can be found at https://grch37.ensembl.org/info/genome/variation/prediction/predicted_data.html
  */
    annotationResponse.forEach(a => {
      const annotation = annotationKeys[`${a.alt}-${a.chrom}-${a.pos}-${a.ref}`];

      if (!annotation || a.consScore > annotation.consScore) {
        annotationKeys[`${a.alt}-${a.chrom}-${a.pos}-${a.ref}`] = a;
      }
    });

    queryResponse.forEach(response => {
      const key = `${response.variant.alt}-${response.variant.chromosome.replace(/chr/i, '')}-${
        response.variant.start
      }-${response.variant.ref}`;

      if (key in annotationKeys) {
        /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
        const { aaAlt, aaPos, aaRef, cdsPos, chrom, pos, alt, ref, ...rest } = annotationKeys[key];
        response.variant.info = {
          ...response.variant.info,
          aaChange:
            aaAlt &&
            AMINO_ACID_MAPPING[aaAlt] &&
            aaPos &&
            aaPos !== 'NA' &&
            aaRef &&
            AMINO_ACID_MAPPING[aaRef]
              ? `p.${AMINO_ACID_MAPPING[aaRef]}${aaPos}${
                  aaAlt === aaRef ? '=' : AMINO_ACID_MAPPING[aaAlt]
                }`
              : 'NA',
          // uses CDSpos instead of cDNApos
          cdna: alt && cdsPos && cdsPos !== 'NA' && ref ? `c.${cdsPos}${ref}>${alt}` : 'NA',
          ...rest,
        };
      }
    });

    return queryResponse;
  }
);

export default annotate;
