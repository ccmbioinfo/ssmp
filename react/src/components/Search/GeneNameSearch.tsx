import React, { useCallback, useEffect, useState } from 'react';
import { NetworkStatus } from '@apollo/client';
import { useAsyncDebounce } from 'react-table';
import { Background, Typography } from '..';
import { useFetchAutocompleteQuery } from '../../apollo/hooks';
import { AssemblyId } from '../../types';
import isCanonicalRegion from '../../utils/isCanonicalRegion';
import ComboBox from '../ComboBox';
import { SelectableListItem } from '../SelectableList';
interface HitPosition {
    chr: string;
    start: number;
    end: number;
}

interface Gene {
    gene: string;
}
interface AutocompleteResults {
    autocompleteResults: {
        hits?: {
            symbol: string;
            ensembl: Gene | Gene[];
            genomic_pos: HitPosition | HitPosition[];
            genomic_pos_hg19: HitPosition | HitPosition[];
        }[];
    };
}
export interface GeneSelectionValue {
    name: string;
    position: string;
}

interface GeneNameSearchProps {
    assembly: AssemblyId;
    geneName: string;
    onSelect: (gene: GeneSelectionValue) => void;
    onChange: (geneName: string) => void;
}

const GeneNameSearch: React.FC<GeneNameSearchProps> = ({
    assembly,
    geneName,
    onChange,
    onSelect,
}) => {
    const [options, setOptions] = useState<SelectableListItem<GeneSelectionValue>[]>([]);

    const [
        fetchAutocompleteResults,
        { data: autocompleteResults, fetchMore: fetchMoreAutocompleteResults, networkStatus },
    ] = useFetchAutocompleteQuery();
    const autocompleteLoading =
        networkStatus === NetworkStatus.loading ||
        networkStatus === NetworkStatus.refetch ||
        networkStatus === NetworkStatus.fetchMore;

    const debouncedAutocompleteFetch = useAsyncDebounce(fetchAutocompleteResults, 500);

    const formatAutocompleteOptions = useCallback(
        (autocompleteResults: AutocompleteResults, assembly: AssemblyId) => {
            const is38 = /38/.test(assembly);
            const something = (autocompleteResults.autocompleteResults.hits || [])
                .filter(
                    hit =>
                        !!hit.ensembl &&
                        ((is38 && !!hit.genomic_pos) || (!is38 && !!hit.genomic_pos_hg19))
                )
                .map((hit, i) => {
                    const { symbol, ...rest } = hit;

                    const ensembl = [rest.ensembl].flat();
                    const genomic_pos = [rest.genomic_pos].flat();
                    const genomic_pos_hg19 = [rest.genomic_pos_hg19].flat();
                    const genes = {
                        symbol,
                        ensembl,
                        genomic_pos,
                        genomic_pos_hg19,
                    };

                    return (is38 ? genomic_pos : genomic_pos_hg19)
                        .filter(g => isCanonicalRegion(g.chr))
                        .map((e, eid) => {
                            return {
                                value: {
                                    name: genes.symbol.toUpperCase(),
                                    position: `${e.chr}:${e.start}-${e.end}`,
                                },
                                id: i + eid,
                                label: `${hit.symbol.toUpperCase()} (Chromosome: ${e.chr}, Start: ${
                                    e.start
                                }, End: ${e.end})`,
                            };
                        });
                })
                .flat();
            return something;
        },
        []
    );

    const fetchMoreAutocompleteOptions = useCallback(async () => {
        if (autocompleteResults) {
            await fetchMoreAutocompleteResults({
                variables: {
                    size: Math.min(1000, autocompleteResults.autocompleteResults.hits.length + 10),
                },
            });
        }
    }, [autocompleteResults, fetchMoreAutocompleteResults]);

    useEffect(() => {
        if (geneName.length)
            debouncedAutocompleteFetch({ variables: { q: geneName.toLowerCase(), size: 10 } });
    }, [debouncedAutocompleteFetch, geneName]);

    useEffect(() => {
        if (options.length && !geneName) setOptions([]);
    }, [geneName, options]);

    useEffect(() => {
        if (autocompleteResults)
            setOptions(formatAutocompleteOptions(autocompleteResults, assembly));
    }, [geneName, assembly, autocompleteResults, formatAutocompleteOptions]);

    return (
        <ComboBox
            options={options}
            fetchMoreOptions={fetchMoreAutocompleteOptions}
            allOptionsFetched={
                autocompleteResults?.autocompleteResults.hits.length ===
                autocompleteResults?.autocompleteResults.total
            }
            fetchMoreButtonText={{
                fetch: `Fetch 10 More Gene Hits (${
                    autocompleteResults?.autocompleteResults.hits.length ?? 0
                }/${autocompleteResults?.autocompleteResults.total ?? 0})`,
                allFetched: `All Gene Hits (${
                    autocompleteResults?.autocompleteResults.total ?? 0
                }) Fetched`,
            }}
            loading={autocompleteLoading}
            onChange={term => onChange(term)}
            onSelect={(item: GeneSelectionValue) => onSelect(item)}
            placeholder="Gene Search"
            searchable
            value={geneName || ''}
            subtext={
                options.length > 1 && (
                    <Background
                        variant="success"
                        style={{
                            margin: 0,
                            padding: '5px 20px',
                        }}
                    >
                        <Typography variant="subtitle" success bold condensed>
                            {options.length} gene aliases found from{' '}
                            {autocompleteResults?.autocompleteResults?.hits.length ?? 0} gene hits.
                            Please select the appropriate gene.
                        </Typography>
                    </Background>
                )
            }
        />
    );
};

export default GeneNameSearch;
