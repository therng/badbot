#!/bin/sh

set -eu

prune_incomplete_prisma_migrations() {
  if [ ! -d prisma/migrations ]; then
    return
  fi

  find prisma/migrations -mindepth 1 -maxdepth 1 -type d | while IFS= read -r migration_dir; do
    if [ ! -f "$migration_dir/migration.sql" ]; then
      echo "Skipping incomplete Prisma migration directory: $(basename "$migration_dir")" >&2
      rm -rf "$migration_dir"
    fi
  done
}

# Only one service should mutate the schema during startup.
if [ "${RUN_DB_MIGRATIONS:-false}" = "true" ]; then
  prune_incomplete_prisma_migrations
  npx prisma migrate deploy
fi

# Execute the CMD from Dockerfile
exec "$@"
