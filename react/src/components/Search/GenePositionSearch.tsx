import React from 'react';
import styled from 'styled-components/macro';
import { Flex, Input } from '..';
import isCanonicalRegion from '../../utils/isCanonicalRegion';

export const Wrapper = styled(Flex)`
    position: relative
    min-height: 38px;
    flex-wrap: nowrap;
    flex-shrink: 1;
    position: relative;
    width: 100%;
`;
interface GenePositionSearchProps {
    position: string;
    onChange: (position: string) => void;
    onError?: (errorText: string | undefined) => void;
}

const GenePositionSearch: React.FC<GenePositionSearchProps> = props => {
    // Update error text based on position format
    const validatePosition = (position: string) => {
        position = position.replaceAll(',', '');
        if (position === '') {
            return undefined;
        }
        const chromStartEnd = position.split(':');
        if (chromStartEnd.length !== 2) {
            return "Invalid format: expected 1 ':' separator between chromosome and start-end";
        }

        const [chrom, region] = chromStartEnd;
        const startEnd = region.split('-');
        if (startEnd.length !== 2) {
            return "Invalid format: expected 1 '-' separator between start and end positions";
        }
        if (!isCanonicalRegion(chrom)) {
            return "Invalid chromosome: expected '1'-'22', 'X' or 'Y'";
        }

        let [start, end] = startEnd.map(s => Number(s.replaceAll(',', '')));
        if (start > end) {
            return 'Invalid region: start position should be less than or equal to end position';
        }
        return undefined;
    };

    const handlePositionChange = (position: string) => {
        if (props.onError) props.onError(validatePosition(position));
        props.onChange(position);
    };

    return (
        <>
            <Wrapper>
                <Input
                    variant="outlined"
                    onChange={e => handlePositionChange(e.currentTarget.value)}
                    value={props.position}
                    placeholder="eg. 1:10,000,000-20,000,000"
                />
            </Wrapper>
        </>
    );
};

export default GenePositionSearch;
