import React, { ChangeEvent, useState } from 'react';
import { BsSearch } from 'react-icons/bs';
import { FaCaretDown } from 'react-icons/fa';
import styled from 'styled-components/macro';
import { useClickAway } from '../hooks';
import Button from './Button';
import Input, { InputProps } from './Input';
import { Flex } from './Layout';
import SelectableList, { SelectableListItem, SelectableListWrapper } from './SelectableList';
import Spinner from './Spinner';

interface ComboBoxProps<T> {
    options: SelectableListItem<T | T[]>[];
    fetchMoreOptions?: () => void;
    allOptionsFetched?: boolean;
    fetchMoreButtonText?: {
        fetch?: string;
        fetching?: string;
        allFetched?: string;
    };
    loading?: boolean;
    onSelect: (item: T) => void;
    onChange?: (searchTerm: string) => void;
    placeholder: string;
    searchable?: boolean;
    isMulti?: boolean;
    selection?: T[];
    value: string;
    subtext?: React.ReactNode;
}

export const Wrapper = styled(Flex)`
    min-height: 38px;
    flex-wrap: wrap;
    flex-grow: 0;
    position: relative;
    width: 100%;
`;

export const StyledInput = styled(Input)<InputProps>`
    cursor: ${props => (props.disabled ? 'pointer' : 'inherit')};
    outline: none;
    position: relative;
    padding: 0;
    width: 70%;
`;

export const Header = styled(Flex)`
    align-items: center;
    background-color: ${props => props.theme.background.main};
    border: ${props => props.theme.borders.thin};
    border-color: ${props => props.theme.colors.muted};
    border-radius: ${props => props.theme.radii.base};
    box-shadow: ${props => props.theme.boxShadow};
    color: ${props => props.theme.colors.muted};
    justify-content: space-between;
    width: inherit;
    padding: 0 ${props => props.theme.space[4]};
    flex-wrap: nowrap;
`;

const FetchMoreButton = styled(Button)`
    justify-content: center !important;
    min-height: unset;
    margin: 0;
    padding: 5px 20px !important;
    border-radius: 0 !important;
    font-size: 0.85rem !important;

    &:disabled {
        opacity: 1;
    }
`;

export default function ComboBox<T extends {}>({
    options,
    fetchMoreOptions,
    allOptionsFetched,
    fetchMoreButtonText = {},
    loading,
    onChange,
    onSelect,
    placeholder,
    searchable,
    value,
    isMulti,
    selection,
    subtext,
}: ComboBoxProps<T>) {
    const {
        fetch = 'Fetch More',
        fetching = 'Fetching...',
        allFetched = 'Nothing More to Fetch',
    } = fetchMoreButtonText;
    const [open, setOpen] = useState<Boolean>(false);

    if (searchable && !onChange) {
        console.error('An onChange function is required for searchable comboboxes!');
    }

    const ignoreRef = React.useRef() as React.MutableRefObject<HTMLDivElement>;
    const ref = React.useRef() as React.MutableRefObject<HTMLUListElement>;

    useClickAway(ref, () => setOpen(false), ignoreRef);

    const getSuggestions = (e: ChangeEvent<HTMLInputElement>) => {
        setOpen(true);
        !!onChange && onChange(e.target.value);
    };

    return (
        <Wrapper ref={ignoreRef}>
            <Header tabIndex={0} role="button" onClick={() => setOpen(true)}>
                {searchable ? (
                    <>
                        <StyledInput
                            value={value}
                            placeholder={placeholder}
                            onChange={getSuggestions}
                        />
                        {loading ? <Spinner size={5} /> : <BsSearch />}
                    </>
                ) : (
                    <>
                        <StyledInput disabled value={value} placeholder={placeholder} />
                        <FaCaretDown />
                    </>
                )}
            </Header>
            <SelectableListWrapper>
                {open && (
                    <SelectableList
                        ref={ref}
                        isMulti={isMulti}
                        selection={selection}
                        options={options}
                        onSelect={item => {
                            onSelect(item as T);
                            if (!isMulti) {
                                setOpen(false);
                            }
                        }}
                        stickyHeader={
                            (subtext || fetchMoreOptions) && (
                                <>
                                    {subtext}
                                    {fetchMoreOptions && !!options.length && (
                                        <FetchMoreButton
                                            disabled={loading || !!allOptionsFetched}
                                            onClick={() => fetchMoreOptions()}
                                            variant="secondary"
                                        >
                                            {!!allOptionsFetched
                                                ? allFetched
                                                : loading
                                                ? fetching
                                                : fetch}
                                        </FetchMoreButton>
                                    )}
                                </>
                            )
                        }
                    />
                )}
            </SelectableListWrapper>
        </Wrapper>
    );
}
