# infra/supabase

PostgreSQL and Supabase infrastructure, schema migrations, and tenant isolation policies.

## Components

- **`migrations/`**: Append-only reviewed SQL migration files applied sequentially.
- **`migrator.ts`**: TypeScript migration runner tracking applied migrations in `app.schema_migrations` with SHA-256 checksums and transaction rollbacks.
- **`policies/`**: Supplementary documentation and declarative policy templates.

## Running Migrations

To apply pending migrations locally:

```bash
# Using tsx to run the migrator directly against local PostgreSQL:
npx tsx infra/supabase/migrator.ts
```

Environment variables:

- `DATABASE_ADMIN_URL` or `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`: Administrative connection parameters (default: `postgres:1234@127.0.0.1:5432/daynori_test`).

## Application Runtime Access

API routes and background workers must connect exclusively as `daynori_runtime` (`runtime_dev_secret_9876` in development). The runtime role has `NOBYPASSRLS` and enforces Row-Level Security on all tables.
