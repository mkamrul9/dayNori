# @daynori/api

Fastify HTTP API service for Daynori.

## Status

Established in Phase 01. Provides minimal runnable service:

- `GET /health`: Liveness and version endpoint conforming to `@daynori/contracts`
- `GET /api/v1/smoke`: Phase 01 smoke validation endpoint
- Scripts: `pnpm build`, `pnpm typecheck`, `pnpm dev`, `pnpm start`

See [system overview](../../docs/architecture/system-overview.md) and [API conventions](../../docs/architecture/api-conventions.md).
