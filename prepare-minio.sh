mc alias set "${MINIO_HOST_ALIAS}" "${MINIO_HOST}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}"
mc mb "${MINIO_HOST_ALIAS}/${MINIO_BUCKET}"