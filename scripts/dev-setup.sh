#!/usr/bin/env bash
# Local development setup for CALLSHEET
# Prerequisites: Node.js 20+, Docker Desktop running

set -euo pipefail

# Docker Desktop on Windows isn't on bash PATH by default
if ! command -v docker &> /dev/null; then
  export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"
fi

echo "=== Checking Docker ==="
docker info > /dev/null 2>&1 || { echo "Docker Desktop must be running"; exit 1; }

echo "=== Starting Supabase local ==="
npx supabase start

echo "=== Installing dependencies ==="
npm install

echo "=== Running migrations ==="
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npx drizzle-kit migrate

echo "=== Seeding taxonomy ==="
npm run db:seed

echo "=== Done ==="
echo "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres"
echo "Run 'npm run dev' to start the development server."
