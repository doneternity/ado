#!/bin/sh
set -eu
echo "running migrations..."
goose -dir /app/migrations postgres "$DATABASE_URL" up
echo "starting api on :${PORT:-8081}..."
exec /app/api
