# Staging

OSMP is deployed via Docker Compose at [https://osmp-staging.genomics4rd.ca/](https://osmp-staging.genomics4rd.ca/). For G4RD data source, the OSMP staging instance is connected to the [staging instance of G4RD Phenotips](https://staging.phenotips.genomics4rd.ca) and the [staging instance of CMH Phenotips](https://phenotipstest-ga4k.cmh.edu). To deploy the frontend, compiled static bundles are uploaded to a designated MinIO bucket. The routing between the frontend and backend is handled by the HAProxy reverse proxy. User accounts are managed in [Keycloak](https://keycloak.-staging.genomics4rd.ca).

## Continuous deployment through Github Actions

On each commit to the `develop` branch, if the changes affect the backend, a Github Actions workflow [Build, test, and deploy backend to staging](https://github.com/ccmbioinfo/osmp/blob/develop/.github/workflows/node.yml) is run. After the Docker image build and test stages pass, we move to the deployment stage. This stage runs on a self-hosted Actions runner that is networked with the staging host, and deploys the backend to the staging host.

If the changes affect the frontend, a different workflow [Build react app and deploy to staging](https://github.com/ccmbioinfo/osmp/blob/develop/.github/workflows/react.yml) builds the frontend, incorporating environment-specific configurations as needed, and uploads the compiled static bundles to a designated S3 (MinIO) bucket.
