import styled from 'styled-components';

interface BackgroundProps {
    variant?: 'success' | 'main' | 'light';
}

export interface FlexProps {
    alignItems?: 'flex-start' | 'baseline' | 'flex-end' | 'center';
    justifyContent?:
        | 'flex-start'
        | 'baseline'
        | 'flex-end'
        | 'center'
        | 'space-between'
        | 'space-around';
    variant?: 'success' | 'main' | 'light';
}

export const Background = styled.div<BackgroundProps>`
    background: ${props => {
        switch (props.variant) {
            case 'success':
                return props.theme.background.success;
            case 'light':
                return props.theme.background.light;
            default:
                return 'inherit';
        }
    }};
    margin: ${props => props.theme.space[4]} 0;
    padding: ${props => props.theme.space[4]};
    border-radius: ${props => props.theme.radii.base};
`;

export const Flex = styled.div<FlexProps>`
    align-items: ${props => props.alignItems ?? 'inherit'};
    display: flex;
    flex-wrap: wrap;
    justify-content: ${props => props.justifyContent ?? 'inherit'};
`;

export const InlineFlex = styled.div`
    display: inline-flex;
    align-items: center;
`;

export const Body = styled.div`
    padding: ${props => props.theme.space[5]};
`;

export const Column = styled(Flex)<FlexProps>`
    flex-direction: column;
    margin: ${props => props.theme.space[3]};
`;

export const ButtonWrapper = styled(Flex)`
    display: inline-flex;
    align-items: center;
`;

export const Container = styled.div`
    margin: 0 auto;
    padding: 0 ${props => props.theme.space[6]};
    width: 100%;
`;
