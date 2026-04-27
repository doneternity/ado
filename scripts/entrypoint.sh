#!/bin/sh
set -eu

echo "running migrations..."
goose -dir /app/migrations postgres "$DATABASE_URL" up

echo "starting api on :${PORT:-8081}..."
/app/api &
API_PID=$!

trap 'kill -TERM "$API_PID" 2>/dev/null; nginx -s quit; exit 0' TERM INT

exec nginx -g 'daemon off;'
