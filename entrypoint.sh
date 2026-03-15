#!/bin/sh

# Run migrations without regenerating client in runtime container
npx --yes prisma db push --skip-generate

# Execute the CMD from Dockerfile
exec "$@"
