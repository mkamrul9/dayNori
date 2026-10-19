# Phase 40: Expense capture reports and budgets (Provisional Local Implementation)

Group: Personal extensions. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [40 — Expense capture reports and budgets](../roadmap/phases/40-expense-capture-reports-and-budgets.md)
- **Status:** `blocked` (Provisional local development completed and verified under explicit owner authorization; completion remains explicitly `blocked` pending prerequisite Phase 37 release gates, Phase 38 private beta deployment, physical Android test hardware, and production credentials).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-19.
- **Base Git revision and branch:** `main` (following prerequisite repairs commit `8c06bd3` `fix(expenses)`).
- **Prerequisites:**
  - [Phase 39 — Expense tracking domain](phase-39.md): Verified and complete with exact minor units, concurrency-safe refunds, recurring templates, and portability support.
  - [Phase 38 — Controlled private beta](phase-38.md): Local preparation completed; release gate decision remains `blocked` pending cloud staging, external signing credentials, and tester cohort.
  - [Phase 37 — Core quality and usability release gate](phase-37.md): Evaluated; release gate decision remains `blocked` on physical Android hardware and production credentials.
- **Included Scope (Provisional Capture, Reports, Budgets & CSV Export)**:
  - **Module Opt-In & Privacy Safeguards**:
    - Privacy by default: `expensesEnabled` defaults to `false` in user profile display preferences (`@daynori/contracts`).
    - Financial summaries and expense widgets are strictly excluded from default Today agenda and unauthenticated previews.
    - Explicit user activation available in Web Settings (`/settings`), Mobile Settings (`SettingsView`), and `/expenses` opt-in banner.
  - **Fast Manual Entry & Transaction Capture (`@daynori/ui-web`, `@daynori/ui-mobile`)**:
    - Web `ExpenseCaptureDialog`: quick manual entry for expense, income, and refund items with exact decimal strings, multi-currency support (USD, EUR, BDT, JPY 0-decimal), category selector, receipt file attachment picker, and original expense linkage for refunds.
    - Mobile `MobileExpenseCaptureSheet`: accessible bottom sheet for mobile transaction capture with touch targets >= 48px, keyboard avoidance, and high-contrast color indicators.
  - **Comprehensive Monthly Reports & Multi-Currency Isolation**:
    - `GET /v1/workspaces/:workspaceId/expenses/summary?year=YYYY&month=MM` providing per-currency summaries without currency coercion.
    - Computes exact `grossExpenseFormatted`, `totalRefundFormatted`, `netExpenseFormatted` (`gross - refunds`), `totalIncomeFormatted`, and `netSavingsFormatted` (`totalIncome - netExpense`).
    - Truthfully handles negative net spending when cross-period refunds exceed current-month gross expenses.
    - Category breakdown with transaction counts and net spending per category.
    - Web `ExpenseReportView` and Mobile `MobileExpenseReportView` with accessible SVG bar visualization and tabular alternative.
  - **Per-Currency Monthly Budgets & Factual Non-Advisory Messages**:
    - Create, list, update, and delete budgets (`app.expense_budgets`) for specific categories or overall workspace spending.
    - Automatic spending and headroom computation against active monthly net spending.
    - Web `ExpenseBudgetView` with visual percentage progress bars, neutral informational tracking messages (e.g. `"20% of budget used. $400.00 remaining in October 2026."`), and strict omission of financial advice or investment recommendations.
  - **CSV Export & Formula Injection Defense (OWASP / RFC 4180)**:
    - `GET /v1/workspaces/:workspaceId/expenses/export` endpoint with date range and category filtering.
    - Neutralizes CSV formula injection attacks by prepending single quote `'` to cells starting with `=`, `+`, `-`, `@`, `\t`, or `\r`.
    - Emits UTF-8 Byte Order Mark (`\uFEFF`) as the initial byte stream to guarantee flawless Unicode and Bangla rendering in spreadsheet software (Microsoft Excel, LibreOffice).
    - Downloads with `Content-Type: text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="expenses-YYYY-MM-DD.csv"`.
  - **Web Application Expenses Destination (`apps/web/src/app/expenses`)**:
    - Responsive month navigation stepper, Transactions list with search, kind, and category filtering, Monthly Report view, Budgets management tab, and one-click CSV export.
  - **Tenant Isolation & Security**:
    - Tenant access verification (`SELECT app.user_has_workspace_role($1, 'viewer')`) across summary, export, and budget routes. Cross-workspace attempts return 404/403.
- **Excluded / Blocked Scope**:
  - Bank account aggregation (Plaid, Yodlee, Salt Edge, Open Banking).
  - Cross-currency exchange rates and conversions.
  - Tax calculation, tax deduction estimation, or automated investment advice.
  - Live cloud deployment, public app store submission, or release gate bypass.

## Acceptance evidence

### Verification Matrix

| Deliverable / Artifact | Path / Command | Observed Result | Status |
| :--- | :--- | :--- | :--- |
| **Contracts Extension** | `packages/contracts/src/api/expenses.ts` & `user.ts` | `expensesEnabled` preference flag, `ExpenseExportQuerySchema`, budget and summary types validated. | **PASS** (Contracts Build) |
| **API Module & Routes** | `apps/api/src/routes/v1/expenses.ts` & `service.ts` | Summary, budgets, and CSV export routes with tenant role check, RFC 4180 escaping, and formula injection defense. | **PASS** (API Build & Tests) |
| **API Client SDK** | `packages/api-client/src/client.ts` | Added `createExpenseBudget`, `listExpenseBudgets`, `updateExpenseBudget`, `deleteExpenseBudget`, `exportExpensesCsv`. | **PASS** (Client Build & Tests) |
| **Web UI Components** | `packages/ui-web` | `ExpenseCaptureDialog`, `ExpenseReportView`, `ExpenseBudgetView` exported with design-tokens compliance. | **PASS** (Build & Typecheck) |
| **Mobile UI Components** | `packages/ui-mobile` | `MobileExpenseCaptureSheet`, `MobileExpenseReportView`, `SettingsView` opt-in toggle exported. | **PASS** (Build & Typecheck) |
| **Web Expenses App Route** | `apps/web/src/app/expenses/page.tsx` | Full-featured responsive expenses hub with month stepper, transaction list, reports, budgets, and CSV export. | **PASS** (Next.js 15 Build) |
| **Phase 40 Integration Suite** | `pnpm vitest run tests/integration/phase40-expenses-reports-budgets.test.ts` | 23/23 tests passing in 725ms covering opt-in preferences, capture, filtering, monthly reports, budgets, non-advisory messages, formula injection defense, UTF-8 BOM, and tenant isolation. | **PASS** (23/23 Passed) |
| **Phase 39 Integration Suite** | `pnpm vitest run tests/integration/phase39-expenses.test.ts` | 32/32 tests passing covering exact money representation, receipt verification, refunds, and recurring templates. | **PASS** (32/32 Passed) |
| **Phase 38 Integration Suite** | `pnpm vitest run tests/integration/phase38-beta-preparation.test.ts` | 17/17 tests passing covering private beta gating, invitation concurrency, and enrollment isolation. | **PASS** (17/17 Passed) |
| **Phase 35 Portability Suite** | `pnpm vitest run tests/integration/phase35-portability-export-import.test.ts` | 35/35 tests passing covering workspace export and import with repaired expense schema columns. | **PASS** (35/35 Passed) |
| **Mobile Unit Test Suite** | `pnpm vitest run apps/mobile/src/auth.test.ts apps/mobile/src/mobile.test.ts` | 51/51 tests passing across mobile session management, preferences, and component mounting. | **PASS** (51/51 Passed) |
| **Repository-wide Build** | `pnpm build` | All 13 workspace projects compile cleanly (including Next.js optimized production build and Expo Android bundle export). | **PASS** (0 Errors) |

## Defects, limitations, and recovery

### Release Gate Status: BLOCKED

Phase 40 expense capture reports, budgets, and CSV export features are fully implemented and verified in local development. However, per project rules (`AGENTS.md`) and roadmap specifications:
- Phase 40 depends on Phase 39 and Phase 38 (Controlled private beta), which remain blocked pending cloud staging infrastructure, release keystore credentials, push provider service accounts, and beta participant cohorts.
- Phase 37 release gate remains blocked pending physical Android TalkBack hardware and production app store credentials.
- In accordance with safety invariants, expense tracking is opt-in (`expensesEnabled: false` by default) and completely excluded from default home views.
- Status is recorded as `blocked` (provisional local development). Work stops before Phase 41.

## Commit target

`feat(expenses): add capture reports and optional budgets`
