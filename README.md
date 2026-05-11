# ADO

AI key issuance + proxy service. Foundation slice.

## Quick start (dev)

```bash
cp .env.example .env
docker compose up
# open http://localhost:8080
```

## Layout

- `backend/` — Go API (chi, pgx, sqlc).
- `backend/migrations/` — goose SQL.
- `frontend/` — React + Vite + TanStack Query + Zustand + SCSS Modules.
- `nginx/` — front-door config (dev + prod variants). 
