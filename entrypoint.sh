#!/bin/sh

set -eu

# Only one service should mutate the schema during startup.
if [ "${RUN_DB_PUSH:-false}" = "true" ]; then
  npx prisma db push --skip-generate
fi

# Execute the CMD from Dockerfile
exec "$@"
