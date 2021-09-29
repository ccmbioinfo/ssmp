import React from 'react';
import { useApolloClient } from '@apollo/client';
import { useFetchVariantsQuery } from '../apollo/hooks';
import {
    Background,
    Body,
    Button,
    ButtonWrapper,
    Checkbox,
    clearError,
    Column,
    ComboBox,
    ErrorIndicator,
    Flex,
    GeneSearch,
    Input,
    Spinner,
    Table,
    Typography,
} from '../components';
import SOURCES from '../constants/sources';
import { useErrorContext, useFormReducer } from '../hooks';
import { formIsValid, FormState, Validator } from '../hooks/useFormReducer';
import { formatErrorMessage } from '../utils';

const queryOptionsFormValidator: Validator<QueryOptionsFormState> = {
    assemblyId: {
        required: true,
    },
    ensemblId: {
        required: state => !state.gene.value,
        rules: [
            {
                valid: (state: FormState<QueryOptionsFormState>) =>
                    state.ensemblId.value.startsWith('ENSG00'),
                error: 'Invalid ensembl ID format.',
            },
        ],
    },
    gene: {
        required: state => !state.ensemblId.value,
        rules: [
            {
                valid: (state: FormState<QueryOptionsFormState>) => state.gene.value.length > 3,
                error: 'Gene must be at least three characters long.',
            },
        ],
    },
    maxFrequency: {
        required: false,
    },

    sources: {
        required: true,
        rules: [
            {
                valid: (state: FormState<QueryOptionsFormState>) =>
                    !!state.sources.value.filter(s => SOURCES.includes(s)).length,
                error: 'Please specify a source.',
            },
        ],
    },
};

interface QueryOptionsFormState {
    assemblyId: string;
    ensemblId: string;
    gene: string;
    maxFrequency: number;
    sources: string[];
}

const ErrorText: React.FC<{ error?: string }> = ({ error }) =>
    error ? (
        <Typography error variant="subtitle" bold>
            {error}
        </Typography>
    ) : null;

const VariantQueryPage: React.FC<{}> = () => {
    const [queryOptionsForm, updateQueryOptionsForm, resetQueryOptionsForm] =
        useFormReducer<QueryOptionsFormState>(
            {
                assemblyId: 'GRCh38',
                ensemblId: 'ENSG00000130203',
                gene: '',
                maxFrequency: 1,
                sources: [],
            },
            queryOptionsFormValidator
        );

    const getArgs = () => ({
        input: {
            variant: {
                assemblyId: queryOptionsForm.assemblyId.value,
                maxFrequency: +queryOptionsForm.maxFrequency.value,
            },
            gene: {
                ensemblId: queryOptionsForm.ensemblId.value,
                geneName: queryOptionsForm.gene.value,
            },
            sources: queryOptionsForm.sources.value,
        },
    });

    const [fetchVariants, { data, loading }] = useFetchVariantsQuery();

    const { state: errorState, dispatch } = useErrorContext();

    const client = useApolloClient();

    const toggleSource = (source: string) => {
        const update = updateQueryOptionsForm('sources');

        queryOptionsForm.sources.value.includes(source)
            ? update(queryOptionsForm.sources.value.filter(s => s !== source))
            : update(queryOptionsForm.sources.value.concat(source));
    };

    return (
        <Body>
            <Flex alignItems="center">
                <Column alignItems="flex-start">
                    <Flex alignItems="center">
                        <Typography variant="h4" bold>
                            Select Sources:
                        </Typography>
                        {SOURCES.map(source => (
                            <Checkbox
                                key={source}
                                checked={queryOptionsForm.sources.value.includes(source)}
                                label={source.toLocaleLowerCase()}
                                onClick={toggleSource.bind(null, source)}
                            />
                        ))}
                    </Flex>
                    <ErrorText error={queryOptionsForm.sources.error} />
                </Column>
            </Flex>
            <Background variant="light">
                <Flex alignItems="flex-end">
                    <Column alignItems="flex-start">
                        <Typography variant="subtitle" bold={!queryOptionsForm.ensemblId.value}>
                            Gene Name
                        </Typography>
                        <GeneSearch
                            geneName={queryOptionsForm.gene.value}
                            onChange={geneName => updateQueryOptionsForm('gene')(geneName)}
                            onSelect={val => {
                                updateQueryOptionsForm('gene')(val.name);
                                updateQueryOptionsForm('ensemblId')(val.ensemblId);
                            }}
                        />
                        <ErrorText error={queryOptionsForm.gene.error} />
                    </Column>
                    <Column alignItems="flex-start">
                        <Typography variant="subtitle" bold>
                            Ensembl ID
                        </Typography>
                        <Input
                            onChange={e => {
                                updateQueryOptionsForm('ensemblId')(e.currentTarget.value);
                                updateQueryOptionsForm('gene')('');
                            }}
                            value={queryOptionsForm.ensemblId.value}
                        />
                        <ErrorText error={queryOptionsForm.ensemblId.error} />
                    </Column>
                    <Column alignItems="flex-start">
                        <Typography variant="subtitle" bold>
                            Max Frequency
                        </Typography>
                        <Input
                            onChange={e =>
                                updateQueryOptionsForm('maxFrequency')(e.currentTarget.value)
                            }
                            value={queryOptionsForm.maxFrequency.value}
                        />
                        <ErrorText error={queryOptionsForm.maxFrequency.error} />
                    </Column>
                    <Column alignItems="flex-start">
                        <Typography variant="subtitle" bold>
                            Assembly ID
                        </Typography>
                        <ComboBox
                            onSelect={val => updateQueryOptionsForm('assemblyId')(val)}
                            options={['GRCh37', 'GRCh38'].map((a, id) => ({
                                id,
                                value: a,
                                label: a,
                            }))}
                            placeholder="Select"
                            value={queryOptionsForm.assemblyId.value}
                        />
                        <ErrorText error={queryOptionsForm.assemblyId.error} />
                    </Column>

                    <ButtonWrapper>
                        <Button
                            disabled={
                                loading || !formIsValid(queryOptionsForm, queryOptionsFormValidator)
                            }
                            onClick={() => fetchVariants({ variables: getArgs() })}
                            variant="primary"
                        >
                            Fetch
                        </Button>
                        <Button
                            onClick={() => {
                                resetQueryOptionsForm();
                            }}
                            variant="primary"
                        >
                            Clear
                        </Button>
                    </ButtonWrapper>
                    <Column justifyContent="flex-start">{loading && <Spinner />}</Column>
                </Flex>
            </Background>
            {[errorState.nodeErrors, errorState.networkErrors, errorState.graphQLErrors]
                .flat()
                .map(e => (
                    <ErrorIndicator
                        key={e.uid}
                        message={formatErrorMessage(e.code, e.message, e.source)}
                        handleCloseError={() => {
                            const cache = client.cache;
                            if (data) {
                                data.getVariants.errors.forEach(e => {
                                    let id = cache.identify({ ...e.error });
                                    cache.evict({ id: id });
                                    cache.gc();
                                });
                            }
                            dispatch(clearError(e.uid));
                        }}
                    />
                ))}
            {data && data.getVariants ? <Table variantData={data.getVariants.data} /> : null}
        </Body>
    );
};

export default VariantQueryPage;
