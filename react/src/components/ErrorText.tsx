import React from 'react';
import styled from 'styled-components/macro';
import Typography from './Typography';

const ErrorWrapper = styled.div`
    margin: 0 0 ${props => props.theme.space[2]};
    padding: ${props => props.theme.space[4]} 0.75rem 0;
`;

const ErrorText: React.FC<{ error?: string }> = ({ error }) =>
    error ? (
        <ErrorWrapper>
            <Typography error variant="subtitle" bold condensed>
                {error}
            </Typography>
        </ErrorWrapper>
    ) : null;

export default ErrorText;
