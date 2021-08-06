import styled from 'styled-components';

interface FlexProps {
    alignItems?: 'flex-start' | 'baseline' | 'flex-end' | 'center';
    justifyContent?: 'flex-start' | 'baseline' | 'flex-end' | 'center';
}

export const Flex = styled.div<FlexProps>`
    align-items: ${props => props.alignItems ?? 'inherit'};
    display: flex;
    flex-wrap: wrap;
    justify-content: ${props => props.justifyContent ?? 'inherit'};
    margin: ${props => props.theme.space[3]} 0;
`;

export const InlineFlex = styled.div`
    display: inline-flex;
    align-items: center;
`;

export const Body = styled.div`
    padding: ${props => props.theme.space[4]};
`;

export const Column = styled(Flex)<FlexProps>`
    flex-direction: column;
    margin-right: ${props => props.theme.space[3]};
    margin-bottom: 0px;
`;

export const ButtonWrapper = styled(Flex)`
    display: inline-flex;
    margin-top: 1.5rem;
`;

export const Container = styled.div`
    margin: 0 auto;
    padding: 0 ${props => props.theme.space[6]};
    width: 100%;
`;
