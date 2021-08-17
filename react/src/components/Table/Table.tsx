import React, { useMemo, useState } from 'react';
import {
    BsFillCaretDownFill,
    BsFillCaretUpFill,
    BsFillEyeFill,
    BsFillEyeSlashFill,
    BsFilter,
} from 'react-icons/bs';
import { CgArrowsMergeAltH, CgArrowsShrinkH } from 'react-icons/cg';
import {
    HeaderGroup,
    useFilters,
    useResizeColumns,
    useBlockLayout,
    useGlobalFilter,
    usePagination,
    useSortBy,
    useTable,
} from 'react-table';
import {
    CallsetInfoFields,
    IndividualResponseFields,
    VariantQueryDataResult,
    VariantResponseFields,
} from '../../types';
import { Button, Checkbox, Column, Flex, InlineFlex, Modal, Typography } from '../index';
import { ColumnFilter } from './ColumnFilter';
import { GlobalFilter } from './GlobalFilters';
import {
    Footer,
    IconPadder,
    Row,
    SkipToBeginning,
    SkipToEnd,
    TableFilters,
    TableStyled,
    TH,
} from './Table.styles';

interface TableProps {
    variantData: VariantQueryDataResult[];
}

type TableRowIndividual = IndividualResponseFields | CallsetInfoFields | { source: string };
type TableRowVariant = Omit<VariantResponseFields, 'callsets'>;
type TableRow = TableRowIndividual | TableRowVariant | { contact: any };

/* flatten calls, will eventually need to make sure call.individualId is reliably mapped to individualId on variant */
const prepareData = (queryResult: VariantQueryDataResult[]): TableRow[] => {
    const results = [] as TableRow[];
    queryResult.forEach(r => {
        const source = r.source;
        r.data.forEach(d => {
            const { callsets, ...rest } = d.variant;
            if (callsets.length) {
                callsets.forEach(cs => {
                    results.push({ ...cs.info, ...rest, ...d.individual, source, contact: '' });
                });
            } else {
                results.push({ ...rest, ...d.individual, source });
            }
        });
    });
    return results;
};

const Table: React.FC<TableProps> = ({ variantData }) => {
    const [open, setOpen] = useState<Boolean>(false);
    const [showModal, setShowModal] = useState<Boolean>(false);

    const tableData = useMemo(() => prepareData(variantData), [variantData]);
    const sortByArray = useMemo(
        () => [
            {
                id: 'ref',
                desc: false,
            },
        ],
        []
    );

    /**
     * The way react-table is set up is if all columns are hidden, the header group will disappear.
     * This is undesired because user may want to re-expand the column.
     * The workaround for this is to keep some columns with fixed visibility.
     */
    const fixedColumns = React.useMemo(
        () => [
            'refseqId',
            'alt',
            'ref',
            'start',
            'end',
            'source',
            // 'empty_variation_details',
            // 'empty_case_details',
        ],
        []
    );

    const columns = React.useMemo(
        () => [
            {
                Header: 'Core',
                id: 'core',
                width: 500,
                columns: [
                    {
                        accessor: 'refseqId',
                        id: 'chromosome',
                        Header: 'Chromosome',
                    },
                    {
                        accessor: 'alt',
                        id: 'alt',
                        Header: 'Alt',
                    },
                    {
                        accessor: 'ref',
                        id: 'ref',
                        Header: 'Ref',
                    },
                    {
                        accessor: 'start',
                        id: 'start',
                        Header: 'Start',
                    },
                    {
                        accessor: 'end',
                        id: 'end',
                        Header: 'End',
                    },
                    {
                        accessor: 'source',
                        id: 'source',
                        Header: 'Source',
                    },
                ],
            },
            {
                Header: 'Variation Details',
                id: 'variation_details',
                width: 80,
                columns: [
                    {
                        accessor: '',
                        id: 'empty_variation_details',
                        Header: '',
                    },
                    {
                        accessor: 'af',
                        id: 'af',
                        Header: 'AF',
                    },
                ],
            },
            {
                Header: 'Case Details',
                id: 'case_details',
                columns: [
                    {
                        accessor: '',
                        id: 'empty_case_details',
                        Header: '',
                    },
                    {
                        accessor: 'datasetId',
                        id: 'datasetId',
                        Header: 'Dataset ID',
                    },
                    {
                        accessor: 'dp',
                        id: 'dp',
                        Header: 'DP',
                    },

                    {
                        accessor: 'ethnicity',
                        id: 'ethnicity',
                        Header: 'Ethnicity',
                    },
                    {
                        accessor: (state: any) =>
                            (state.phenotypicFeatures || [])
                                .map((p: any) => p.phenotypeId)
                                .join(', '),
                        id: 'phenotypes',
                        Header: 'Phenotypes',
                        width: 200,
                    },

                    {
                        accessor: 'sex',
                        id: 'sex',
                        Header: 'Sex',
                    },

                    {
                        accessor: 'zygosity',
                        id: 'zygosity',
                        Header: 'Zygosity',
                    },
                    {
                        accessor: () => (
                            <Flex justifyContent="center">
                                <Button variant="primary">Contact</Button>
                            </Flex>
                        ),
                        id: 'contact',
                        Header: 'Contact',
                    },
                ],
            },
        ],
        []
    );

    const defaultColumn = React.useMemo(
        () => ({
            minWidth: 30,
            width: 80,
            maxWidth: 300,
        }),
        []
    );

    const tableInstance = useTable<TableRow>(
        {
            columns,
            defaultColumn,
            data: tableData,
            initialState: {
                sortBy: sortByArray,
                hiddenColumns: ['empty_variation_details', 'empty_case_details'],
            },
        },
        useResizeColumns,
        useFilters,
        useGlobalFilter,
        useSortBy,
        usePagination
    );

    const {
        getTableProps,
        getTableBodyProps,
        headerGroups,
        page,
        nextPage,
        previousPage,
        canNextPage,
        canPreviousPage,
        pageOptions,
        gotoPage,
        pageCount,
        setPageSize,
        state,
        setFilter,
        setAllFilters,
        setGlobalFilter,
        prepareRow,
        toggleHideColumn,
        // visibleColumns,
    } = tableInstance;

    const { filters, globalFilter, pageIndex, pageSize } = state;

    const handleGroupChange = (g: HeaderGroup<TableRow>) =>
        g.columns?.map(c => !fixedColumns.includes(c.id) && toggleHideColumn(c.id, c.isVisible));

    const isExpanded = (column: HeaderGroup<TableRow>) => {
        const status =
            column.Header === 'Core' // Always expand the Core group
                ? true
                : !column.parent && // Must be a header group
                  column.Header !== 'Core' &&
                  column.columns && 
                  column.columns.filter(c => c.isVisible).length >= 1 && // Header group is expanded if there is at least one visible column
                  !column.columns.filter(c => c.id.includes('empty'))[0].isVisible; // The only column that exists must not be a dummy column.

        return status;
    };

    return (
        <>
            <TableFilters justifyContent="space-between">
                <InlineFlex>
                    <GlobalFilter filter={globalFilter} setFilter={setGlobalFilter} />
                    <Button variant="secondary" onClick={() => setOpen(prev => !prev)}>
                        Advanced Filters{' '}
                        <IconPadder>
                            <BsFilter />
                        </IconPadder>
                    </Button>
                    <Button
                        disabled={filters.length > 0 ? false : true}
                        variant="secondary"
                        onClick={() => setAllFilters([])}
                    >
                        Clear all filters
                    </Button>
                </InlineFlex>
                <InlineFlex>
                    <Button variant="secondary" onClick={() => setShowModal(!showModal)}>
                        Customize columns
                        <IconPadder>
                            {showModal ? <BsFillEyeFill /> : <BsFillEyeSlashFill />}
                        </IconPadder>
                    </Button>
                    <Modal
                        active={showModal}
                        hideModal={() => setShowModal(false)}
                        title="Customize Columns"
                    >
                        {headerGroups[0].headers.map((g, id) => (
                            <div key={id}>
                                <Checkbox
                                    label={g.id}
                                    checked={g.isVisible}
                                    onClick={() => handleGroupChange(g)}
                                />
                                {g.columns?.map(
                                    (c, id) =>
                                        !fixedColumns.includes(c.id) && (
                                            <div key={id} style={{ paddingLeft: 20 }}>
                                                <Checkbox
                                                    label={c.id}
                                                    checked={c.isVisible}
                                                    onClick={() =>
                                                        toggleHideColumn(c.id, c.isVisible)
                                                    }
                                                />
                                            </div>
                                        )
                                )}
                            </div>
                        ))}
                    </Modal>
                </InlineFlex>
            </TableFilters>

            {open && (
                <TableFilters justifyContent="flex-start" alignItems="flex-start">
                    {columns
                        .map(c => c.columns)
                        .flat()
                        .map((v, i) => (
                            <Column key={i}>
                                <Typography variant="subtitle" bold>
                                    {v.Header}
                                </Typography>
                                <ColumnFilter
                                    filters={filters}
                                    setFilter={setFilter}
                                    columnId={v.id}
                                />
                            </Column>
                        ))}
                </TableFilters>
            )}

            <TableStyled {...getTableProps()}>
                <thead>
                    {headerGroups.map(headerGroup => {
                        // https://github.com/tannerlinsley/react-table/discussions/2647
                        const { key, ...restHeaderGroupProps } = headerGroup.getHeaderGroupProps();
                        return (
                            <Row key={key} {...restHeaderGroupProps}>
                                {headerGroup.headers.map(column => {
                                    const { key, ...restHeaderProps } = column.getHeaderProps(
                                        column.getSortByToggleProps()
                                    );
                                    console.log(column);
                                    return (
                                        // Check if child column header is visible
                                        <TH
                                            expanded={
                                                !column.parent
                                                    ? isExpanded(column)
                                                    : column.isVisible
                                            }
                                            type={!column.parent ? 'groupHeader' : 'columnHeader'}
                                            key={key}
                                            maxWidth={column.maxWidth}
                                            minWidth={column.minWidth}
                                            width={column.width}
                                            {...restHeaderProps}
                                        >
                                            <span>
                                                {column.render('Header')}
                                                {!column.parent &&
                                                    column.columns &&
                                                    column.Header !== 'Core' &&
                                                    (column.columns.filter(c => c.isVisible)
                                                        .length ===
                                                    columns.filter(
                                                        c => c.Header === column.Header
                                                    )[0].columns.length ? (
                                                        <IconPadder>
                                                            <CgArrowsMergeAltH
                                                                onClick={() =>
                                                                    handleGroupChange(column)
                                                                }
                                                            />
                                                        </IconPadder>
                                                    ) : (
                                                        <IconPadder>
                                                            <CgArrowsShrinkH
                                                                onClick={() =>
                                                                    handleGroupChange(column)
                                                                }
                                                            />
                                                        </IconPadder>
                                                    ))}
                                                {column.isSorted ? (
                                                    column.isSortedDesc ? (
                                                        <BsFillCaretUpFill />
                                                    ) : (
                                                        <BsFillCaretDownFill />
                                                    )
                                                ) : (
                                                    ''
                                                )}
                                            </span>
                                        </TH>
                                    );
                                })}
                            </Row>
                        );
                    })}
                </thead>
                <tbody {...getTableBodyProps()}>
                    {page.length > 0 ? (
                        page.map(row => {
                            prepareRow(row);
                            const { key, ...restRowProps } = row.getRowProps();
                            return (
                                <Row
                                    // layout="position"
                                    key={key}
                                    {...restRowProps}
                                >
                                    {row.cells.map(cell => {
                                        const { key, ...restCellProps } = cell.getCellProps();
                                        return (
                                            <td
                                                // layout="position"
                                                key={key}
                                                {...restCellProps}
                                            >
                                                {cell.render('Cell')}
                                            </td>
                                        );
                                    })}
                                </Row>
                            );
                        })
                    ) : (
                        <Typography variant="p" error>
                            There are no records to display.
                        </Typography>
                    )}
                </tbody>
            </TableStyled>
            <Footer>
                <span>
                    <Typography variant="subtitle">Rows per page:</Typography>
                    <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>
                        {[10, 25, 50].map(pageSize => (
                            <option key={pageSize} value={pageSize}>
                                {pageSize}
                            </option>
                        ))}
                    </select>
                </span>
                <Typography variant="subtitle">
                    Page
                    <strong>
                        {pageIndex + 1} of {pageOptions.length}
                    </strong>
                </Typography>
                <button onClick={() => gotoPage(0)} disabled={!canPreviousPage}>
                    <SkipToBeginning fontSize="small" />
                </button>
                <button onClick={() => previousPage()} disabled={!canPreviousPage}>
                    Previous
                </button>
                <button onClick={() => nextPage()} disabled={!canNextPage}>
                    Next
                </button>
                <button onClick={() => gotoPage(pageCount - 1)} disabled={!canNextPage}>
                    <SkipToEnd fontSize="small" />
                </button>
            </Footer>
        </>
    );
};
export default Table;
