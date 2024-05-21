import React, { useState } from 'react';
import { FaCaretDown } from 'react-icons/fa';
import styled from 'styled-components/macro';
import { useClickAway } from '../../hooks';
import { AssemblyId } from '../../types';
import { Flex } from '../Layout';
import SelectableList, { SelectableListItem, SelectableListWrapper } from '../SelectableList';
import GeneNameSearch, { GeneSelectionValue } from './GeneNameSearch';
import GenePositionSearch from './GenePositionSearch';

const SearchWrapper = styled(Flex)`
    position: relative
    min-height: 40px;
    flex-wrap: nowrap;
    flex-grow: 1;
    position: relative;
    width: 100%;
`;

const DropdownWrapper = styled(Flex)`
    position: relative;
    min-height: 38px;
    flex-grow: 0;
`;

const DropdownHeader = styled(Flex)`
    background-color: ${props => props.theme.background.main};
    border: ${props => props.theme.borders.thin};
    border-color: ${props => props.theme.colors.muted};
    border-radius: ${props => props.theme.radii.base};
    box-shadow: ${props => props.theme.boxShadow};
    color: ${props => props.theme.colors.muted};
    padding: 0 ${props => props.theme.space[4]};
    flex-wrap: nowrap;
    text-wrap: nowrap;
    overflow: hidden;
    white-space: nowrap;
    min-height: 40px;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
`;

const DropdownHeaderText = styled.div`
    color: ${props => props.theme.colors.text};
    cursor: pointer;
    font-size: 14px;
`;

interface DropdownProps {
    options: SelectableListItem<string>[];
    value: string;
    onSelect: (option: string) => void;
}

/**
 * Dropdown component for selecting search type.
 */
const Dropdown: React.FC<DropdownProps> = props => {
    // ComboBox styling is too deep, so we need our own dropdown

    const [open, setOpen] = useState<Boolean>(false);

    const ignoreRef = React.useRef() as React.MutableRefObject<HTMLDivElement>;
    const ref = React.useRef() as React.MutableRefObject<HTMLUListElement>;

    useClickAway(ref, () => setOpen(false), ignoreRef);

    return (
        <DropdownWrapper ref={ignoreRef}>
            <DropdownHeader tabIndex={0} role="button" onClick={() => setOpen(true)}>
                <DropdownHeaderText>{props.value}</DropdownHeaderText>
                <FaCaretDown
                    style={{
                        marginLeft: '8px',
                    }}
                />
            </DropdownHeader>
            <SelectableListWrapper>
                {open && (
                    <SelectableList
                        ref={ref}
                        options={props.options}
                        onSelect={item => {
                            props.onSelect(item as string);
                            setOpen(false);
                        }}
                    />
                )}
            </SelectableListWrapper>
        </DropdownWrapper>
    );
};

interface GeneCombinedSearchProps {
    assembly: AssemblyId;
    geneName: string;
    onNameChange: (geneName: string) => void;
    onNameSelect: (gene: GeneSelectionValue) => void;
    genePosition: string;
    onPositionChange: (genePosition: string) => void;
    onError?: (errorText: string | undefined) => void;
}

const OPTIONS = ['Gene Name', 'Position'];

/**
 * Combined search component for searching by gene name or by position.
 * Contains a dropdown integrated into the search bar where the user can
 * switch between search modes.
 */
const GeneCombinedSearch: React.FC<GeneCombinedSearchProps> = props => {
    const [searchMode, setSearchMode] = useState<string>(OPTIONS[0]);

    return (
        <SearchWrapper>
            <Dropdown
                options={OPTIONS.map((a, id) => ({
                    id,
                    value: a,
                    label: a,
                }))}
                onSelect={option => setSearchMode(option)}
                value={searchMode}
            />
            {searchMode === 'Gene Name' && (
                <GeneNameSearch
                    assembly={props.assembly}
                    geneName={props.geneName}
                    onChange={props.onNameChange}
                    onSelect={props.onNameSelect}
                />
            )}
            {searchMode === 'Position' && (
                <GenePositionSearch
                    position={props.genePosition}
                    onChange={props.onPositionChange}
                    onError={props.onError}
                />
            )}
        </SearchWrapper>
    );
};

export default GeneCombinedSearch;
