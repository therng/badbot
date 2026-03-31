#!/bin/sh

set -eu

# Only one service should mutate the schema during startup.
if [ "${RUN_DB_MIGRATIONS:-false}" = "true" ]; then
  npx prisma migrate deploy
fi

# Execute the CMD from Dockerfile
exec "$@"
