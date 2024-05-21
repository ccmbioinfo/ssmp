import { Cell, HeaderGroup } from 'react-table';
import { ResultTableColumns } from '../components/Table/Table';
import {
    CallsetInfoFields,
    IndividualInfoFields,
    IndividualResponseFields,
    VariantQueryDataResult,
    VariantResponseFields,
    VariantResponseInfoFields,
} from '../types';

type Variant = Pick<VariantResponseFields, 'ref' | 'alt' | 'start' | 'end'>;

interface PatientBurdenCount {
    [x: string]: number;
}

export type FlattenedQueryResponse = Omit<IndividualResponseFields, 'info' | 'diseases'> &
    IndividualInfoFields & { contactInfo: string } & Omit<
        VariantResponseFields,
        'callsets' | 'info'
    > &
    CallsetInfoFields &
    VariantResponseInfoFields & { source: string; diseases: string };

const flattenBaseResults = (result: VariantQueryDataResult): FlattenedQueryResponse => {
    const { contactInfo, source } = result;
    const { callsets, info: variantInfo, ...restVariant } = result.variant;
    const { sex, diseases, info: individualInfo, ...restIndividual } = result.individual;
    const flattenedDiseases = (diseases || []).reduce(
        (a, c, i) => `${a}${i ? ';' : ''}${c.diseaseLabel}`,
        ''
    );

    return {
        contactInfo,
        diseases: flattenedDiseases,
        sex: resolveSex(sex || ''),
        ...individualInfo,
        ...restIndividual,
        ...restVariant,
        source,
        ...variantInfo,
    };
};

const addAdditionalFieldsAndFormatNulls = (
    results: FlattenedQueryResponse,
    uniqueId: number
): ResultTableColumns => ({
    ...results,
    chromosome: results.chromosome.replace('chr', ''),
    emptyCaseDetails: '',
    emptyVariationDetails: '',
    uniqueId,
    cdna: results.cdna || 'NA',
    aaChange: results.aaChange || 'NA',
    af: results.af || 0,
    ac: results.ac || 0,
    gnomadHom: results.gnomadHom || 0,
    // gnomadHet: results.gnomadHet || 0,
    maleCount: 0,
    geneName: !!results.geneName ? results.geneName! : 'Not Specified',
});

export const calculateColumnWidth = (
    headerText: string,
    toolTip: boolean = false,
    maxDataLength?: number
) => {
    const maxWidth = 400;
    const cellLength = maxDataLength
        ? Math.max(maxDataLength, headerText.length)
        : headerText.length;
    const toolTipLength = toolTip ? 15 : 0;
    return Math.min(maxWidth, cellLength * 7 + 41 + toolTipLength);
};

export const isHeader = (column: HeaderGroup<ResultTableColumns>) => !column.parent;

export const isHeaderExpanded = (column: HeaderGroup<ResultTableColumns>) => {
    if (isHeader(column) && column.columns) {
        const visibleColumns = column.columns.filter(c => c.isVisible).map(c => c.id);
        const intersection = visibleColumns.filter(value =>
            ['emptyVariationDetails', 'emptyCaseDetails', 'emptyCore'].includes(value)
        );
        return !intersection.length;
    }
    return false;
};

export const isCaseDetailsCollapsed = (headers: HeaderGroup<ResultTableColumns>[]) => {
    const caseDetailsCol = headers.find(header => header.Header === 'Case Details');
    return caseDetailsCol && !isHeaderExpanded(caseDetailsCol);
};

const resolveSex = (sexPhenotype: string) => {
    if (sexPhenotype.toLowerCase().startsWith('m') || sexPhenotype === 'NCIT:C46112') {
        return 'Male';
    } else if (sexPhenotype.toLowerCase().startsWith('f') || sexPhenotype === 'NCIT:C46113') {
        return 'Female';
    } else if (sexPhenotype === 'NCIT:C46113') {
        return 'Other Sex';
    } else return 'Unknown';
};

const sortQueryResult = (queryResult: VariantQueryDataResult[]) => {
    const sortedQueryResult = [...queryResult].sort(
        (a, b) =>
            a.variant.ref.localeCompare(b.variant.ref) ||
            a.variant.alt.localeCompare(b.variant.alt) ||
            a.variant.start - b.variant.start ||
            a.variant.end - b.variant.end
    );
    return sortedQueryResult;
};

export const isHeterozygous = (zygosity: string | null | undefined) => {
    return !!zygosity?.toLowerCase().includes('het');
};

export const isHomozygous = (zygosity: string | null | undefined) => {
    return !!zygosity?.toLowerCase().includes('hom');
};

export const isMale = (sex: string | null | undefined) => resolveSex('' + sex) === 'Male';

export const isLastCellInSet = (cell: Cell<ResultTableColumns>, columnOrder: string[]) =>
    !!cell.column &&
    // Check if the cell's column is the last in its set (excluding hidden columns)
    isLastHeaderInSet(cell.column as HeaderGroup<ResultTableColumns>, columnOrder);

export const isLastHeaderInSet = (
    column: HeaderGroup<ResultTableColumns>,
    columnOrder: string[]
) => {
    // Filter out the hidden and empty-typed columns from the current column's set
    const visibleNonEmptyColumnIds = (
        column.parent?.columns?.filter(c => c.isVisible && c.type !== 'empty') ?? []
    ).map(c => c.id);

    return (
        // Check if the current column is one of the top-most headers;
        // i.e., "Variant", "Variant Details", or "Case Details"
        column.parent === undefined ||
        // Check if the current column in one of the empty columns
        column.type === 'empty' ||
        // columnOrder is an empty array if none of the columns have been reordered
        (columnOrder.length === 0
            ? // If none of the columns have been reordered, check if the current column is the last in its set
              // (excluding hidden and empty-typed columns)
              visibleNonEmptyColumnIds.at(-1) === column.id
            : // Otherwise, check if any of the current column's subsequent (visible and non-empty-typed) columns, according to columnOrder,
              // belongs to the same set
              columnOrder
                  // There's no need to check the columns that precede the current column
                  .slice(columnOrder.indexOf(column.id) + 1)
                  .findIndex(cId => visibleNonEmptyColumnIds.includes(cId)) === -1)
    );
};

// 1, Sort queryResult in ascending order according to variant's ref, alt, start, end.
// 2, Flatten data and compute values as needed (note that column display formatting function should not alter values for ease of export). Assign uniqueId, homozygousCount, heterozygousCount, maleCount to each row.
export const prepareData = (
    queryResult: VariantQueryDataResult[]
): [ResultTableColumns[], number[]] => {
    const sortedQueryResult = sortQueryResult(queryResult);

    const result: Array<ResultTableColumns> = [];

    // contains indices of first encountered rows that represent unique variants.
    const uniqueVariantIndices: Array<number> = [];

    var currVariant = {} as Variant;
    var currUniqueId = 0;
    var currRowId = 0;
    var currHomozygousCount = 0;
    var currHeterozygousCount = 0;
    var currMaleCount = 0;

    // sorted by variant
    sortedQueryResult.forEach(d => {
        const { ref, alt, start, end } = d.variant;
        // if different variant from previous iteration
        if (
            currVariant.ref !== ref ||
            currVariant.alt !== alt ||
            currVariant.start !== start ||
            currVariant.end !== end
        ) {
            // Update previous batch of rows that were all the same variant
            if (uniqueVariantIndices.length) {
                result
                    .slice(uniqueVariantIndices[uniqueVariantIndices.length - 1], currRowId)
                    .forEach(row => {
                        row.homozygousCount = currHomozygousCount;
                        row.heterozygousCount = currHeterozygousCount;
                        row.maleCount = currMaleCount;
                    });
            }

            currHomozygousCount = 0;
            currHeterozygousCount = 0;
            currVariant = { ref, alt, start, end };
            currUniqueId += 1;
            currMaleCount = 0;
            uniqueVariantIndices.push(currRowId);
        }

        // update counts
        if (d.variant.callsets.length) {
            result.push.apply(
                result,
                d.variant.callsets
                    .filter(cs => {
                        if (cs.individualId === d.individual.individualId) {
                            if (isHeterozygous(cs.info.zygosity)) {
                                currHeterozygousCount += 1;
                            } else if (isHomozygous(cs.info.zygosity)) {
                                currHomozygousCount += 1;
                            }
                            if (isMale(d.individual.sex)) {
                                currMaleCount += 1;
                            }

                            return true;
                        } else {
                            return false;
                        }
                    })
                    .map(cs =>
                        addAdditionalFieldsAndFormatNulls(
                            {
                                ...cs.info,
                                ...flattenBaseResults(d),
                            },
                            currUniqueId
                        )
                    )
            );
        } else {
            result.push(addAdditionalFieldsAndFormatNulls(flattenBaseResults(d), currUniqueId));
        }
        currRowId += 1;
    });
    result.slice(uniqueVariantIndices[uniqueVariantIndices.length - 1], currRowId).forEach(row => {
        row.homozygousCount = currHomozygousCount;
        row.heterozygousCount = currHeterozygousCount;
        row.maleCount = currMaleCount;
    });

    // update individualId, familyId with source prefix
    // (P0001 from G4RD is not the same as P0001 from CMH)
    result.map(r => {
        if (r.individualId) {
            r.individualId = [r.source, r.individualId].join('_');
        }
        if (r.familyId) {
            r.familyId = [r.source, r.familyId].join('_');
        }
        return r;
    });

    // Remove duplicate variants for the same patient
    const uniquePatientVariants = result.filter(
        (arr, index, self) =>
            index ===
            self.findIndex(
                t =>
                    t.start === arr.start &&
                    t.end === arr.end &&
                    t.alt === arr.alt &&
                    t.ref === arr.ref &&
                    t.individualId === arr.individualId &&
                    t.source === arr.source
            )
    );

    const patientBurdenCount: PatientBurdenCount = {};

    uniquePatientVariants.forEach(p => {
        if (p.individualId) {
            if (patientBurdenCount[p.individualId]) {
                patientBurdenCount[p.individualId] += 1;
            } else {
                patientBurdenCount[p.individualId] = 1;
            }
        }
    });

    result.map(r => {
        if (r.individualId) {
            r.burdenCount = patientBurdenCount[r.individualId];
        }
        return r;
    });

    return [result, uniqueVariantIndices];
};
