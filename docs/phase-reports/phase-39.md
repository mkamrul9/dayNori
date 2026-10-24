# Phase 39: Expense tracking domain (Provisional Local Implementation)

Group: Personal extensions. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [39 — Expense tracking domain](../roadmap/phases/39-expense-tracking-domain.md)
- **Status:** `blocked` (Provisional local development completed and verified under explicit owner authorization; completion remains explicitly `blocked` pending prerequisite Phase 37 release gates, Phase 38 private beta deployment, physical Android test hardware, and production credentials).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-19.
- **Base Git revision and branch:** `main` (following prerequisite repairs commit `81e1546` `fix(lifecycle)`).
- **Prerequisites:**
  - [Phase 38 — Controlled private beta](phase-38.md): Local preparation completed; release gate decision remains `blocked` pending cloud target, external signing credentials, and tester cohort.
  - [Phase 37 — Core quality and usability release gate](phase-37.md): Evaluated; release gate decision remains `blocked` on physical Android hardware and production credentials.
- **Included Scope (Provisional Domain & Persistence)**:
  - **Exact Money Representation (`@daynori/domain`)**:
    - Integer minor units (`BigInt`) and exact decimal strings without IEEE 754 floating-point drift.
    - Currency metadata registry supporting zero-decimal (JPY), two-decimal (USD, BDT, EUR), and three-decimal (KWD) currencies.
    - Multi-currency isolation: sums and breakdowns grouped strictly per-currency without currency coercion or automatic conversion.
  - **Workspace Expense, Income, and Refund Items (`@daynori/contracts`, `apps/api`)**:
    - Item records extending `app.items` with `app.expense_items` (`kind IN ('expense', 'income', 'refund')`).
    - Workspace-scoped categories (`app.expense_categories`) with unique normalized names, soft-deletion, and color/icon metadata.
    - Transaction date, timezone, payment label, and optional canonical folder assignment.
    - Verified receipt file attachment with strict workspace matching, active verification (`quarantine_status = 'verified'`), and quarantine protection.
  - **Concurrency-Safe Refunds & Cumulative Bounds**:
    - Transactional locking (`SELECT ... FOR UPDATE`) of original expense records.
    - Strict refund invariant validation: cumulative active refunds cannot exceed the original expense amount.
    - Category spending reduction: refunds reduce net category spending rather than inflating income; cross-month refunds truthfully reflect negative net spending when applicable.
    - Protection against original expense deletion or amount reduction below active cumulative refund totals.
    - Restoring a trashed refund atomically re-evaluates and re-claims refundable headroom.
  - **Recurring Entry Templates & Occurrence Deduplication**:
    - Recurring templates (`app.expense_recurring_templates`) supporting daily, weekly, monthly, and yearly intervals.
    - Idempotent occurrence generation (`/v1/workspaces/:workspaceId/expenses/recurring/generate`) tracking generated occurrences in `app.expense_recurring_occurrences` without duplication.
  - **Synchronization Change Feed Integration**:
    - Full mutation receipts and sequence increments in `app.workspace_sync_state` and `app.changes`.
    - Cascade cleanup in `app.purge_owned_workspace` to guarantee clean tenant isolation and workspace deletion.
  - **Architecture Decision Record**:
    - [ADR 0039: Expense Tracking Domain & Exact Money Invariants](../decisions/0039-expense-tracking-domain-and-money-invariants.md).
- **Excluded / Blocked Scope**:
  - Bank account linking, transaction scraping, or financial data aggregators (Plaid/Yodlee).
  - Tax estimation, deductions, or accounting/financial advice.
  - Currency conversion rates or cross-currency aggregation.
  - UI exposure on Web or Mobile (beta feature flags and router barriers keep expenses disabled in beta mode; `/v1/expenses` gated with HTTP 403 when `enableExpenses` is false).

## Acceptance evidence

### Verification Matrix

| Deliverable / Artifact | Path / Command | Observed Result | Status |
| :--- | :--- | :--- | :--- |
| **Domain Money Invariants** | `packages/domain/src/expenses.ts` | Exact minor units, decimal strings, 0/2/3 decimal exponents, BigInt precision, non-negative amounts enforced. | **PASS** (Unit & Integration) |
| **API Contracts** | `packages/contracts/src/api/expenses.ts` | Complete Zod schemas for categories, items, refunds, monthly summaries, and recurring templates. | **PASS** (Contract Validation) |
| **Database Migration 00040** | `infra/supabase/migrations/00040_expense_tracking_domain.sql` | RLS policies, unique constraints, foreign keys with CASCADE, and workspace purge procedure. | **PASS** (PostgreSQL 17 Applied) |
| **API Module & Routes** | `apps/api/src/routes/v1/expenses.ts` | 11 REST endpoints with tenant isolation, transaction row locks, sync change feed integration. | **PASS** (Integration Suite) |
| **API Client SDK** | `packages/api-client/src/client.ts` | Typed methods for all category, item, refund, summary, and recurring template operations. | **PASS** (Integration Suite) |
| **Phase 39 Integration Suite** | `pnpm vitest run tests/integration/phase39-expenses.test.ts` | 32/32 test cases passing covering money precision, receipt auth, refunds, recurring deduplication, and beta 403 gating. | **PASS** (32/32 Passed) |
| **Prerequisite Integration Suite** | `pnpm vitest run tests/integration/phase37-prerequisite-repairs.test.ts tests/integration/phase38-beta-preparation.test.ts tests/integration/disaster-recovery-drill.test.ts` | 41/41 test cases passing (lifecycle, beta gating, real disposable recovery drill). | **PASS** (41/41 Passed) |
| **Core Journeys Integration** | `pnpm vitest run tests/e2e/core-organizer-journeys.test.ts` | 13/13 journeys passing (including updated asynchronous deletion status expectation). | **PASS** (13/13 Passed) |
| **Monorepo Typecheck** | `pnpm typecheck` | Clean TypeScript compilation across all 13 workspace projects with 0 errors. | **PASS** (0 Errors) |
| **Monorepo Lint** | `pnpm lint` | Clean ESLint across all repository packages with 0 errors and 0 warnings. | **PASS** (0 Errors) |

## Defects, limitations, and recovery

### Release Gate Status: BLOCKED

Phase 39 domain and persistence logic is fully implemented and locally verified. However, per repository rules (`AGENTS.md`) and the Phase 39 specification:
- Phase 39 depends on Phase 38 (Controlled private beta), which remains blocked pending cloud staging infrastructure, release keystore credentials, push provider service accounts, and beta participant cohorts.
- Phase 37 release gate remains blocked pending physical Android TalkBack hardware and production app store credentials.
- In accordance with safety invariants, expense tracking is disabled by default in production and beta environments via feature flags and server route barriers (`ENABLE_EXPENSES=false` returns HTTP 403).
- Status is recorded as `blocked` (provisional local development). Phase 40 will not proceed until authorized.

## Commit target

`feat(expenses): add precise manual expense and income records`
