import { useEffect } from 'react';
import { useKeycloak } from '@react-keycloak/web';
import { ErrorBoundary } from 'react-error-boundary';
import { Route, BrowserRouter as Router, Switch } from 'react-router-dom';
import { AboutPage, VariantQueryPage } from '.';
import { ErrorProvider, ErrorFallback, Flex, Navbar, Spinner } from '../components';

const App: React.FC<{}> = () => {
    const {
        keycloak: { authenticated, login },
        initialized,
    } = useKeycloak();

    useEffect(() => {
        if (initialized && !authenticated) {
            login();
        }
    }, [initialized, authenticated, login]);

    return !initialized ? (
        <Flex justifyContent="center" alignItems="center">
            <Spinner />
        </Flex>
    ) : authenticated ? (
        <div>
            <ErrorProvider>
            <Router>
                <Navbar />
                <ErrorBoundary
                    FallbackComponent={({ error, resetErrorBoundary }) => (
                        <ErrorFallback
                            error={error}
                            variant="normal"
                            resetErrorBoundary={resetErrorBoundary}
                        />
                    )}
                >
                    <Switch>
                        <Route path="/about">
                            <AboutPage />
                        </Route>
                        <Route path="/">
                            <VariantQueryPage />
                        </Route>
                    </Switch>
                </ErrorBoundary>
            </Router>
            </ErrorProvider>
        </div>
    ) : null;
};

export default App;
