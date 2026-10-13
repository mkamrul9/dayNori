# ADR-0002: Modular monolith and managed core

Date: 2026-10-13. Status: accepted for planning; production region/plan remains unselected.

## Context

Many related private domains need consistent authorization, sync transactions, deletion and export. Early operational complexity would slow the small phased development process.

## Decision

Use Fastify modular application services with one PostgreSQL database, managed Supabase Auth, and separate API/worker processes from the same backend source. Use SQL migrations, a restricted runtime database role/RLS, and API-owned domain transactions. Do not expose direct client writes to application tables or ship administrative credentials. Vendor adapters sit behind interfaces; integration setup follows its phase.

## Alternatives

Microservices would introduce distributed transactions, duplicated identity checks and recovery coordination before the workload needs them. Client-only Supabase domain writes simplify hosting but make cross-domain commands, durable receipts and lifecycle checks harder to centralize. Self-hosting Auth/database adds an unnecessary initial operational burden.

## Consequences and validation

The API becomes an availability dependency and ordinary content remains readable by the trusted backend. Database role/RLS tests must use the actual runtime connection, including pool reuse and two-user negative access. Benchmark region latency, verify plan/backup cost and prove restore before public release. Add Redis or split services only for a measured bottleneck or ownership need.

See [system overview](../architecture/system-overview.md) and [security](../architecture/security-and-vault.md).
