# ADR 0039: Expense Tracking Domain, Exact Money Invariants, and Refund Concurrency

## Status

Accepted (provisional local development for Phase 39).

## Context

Daynori is expanding its private personal organizer to include personal manual expense and income tracking ([Phase 39](../roadmap/phases/39-expense-tracking-domain.md), Requirement `R-EXPENSE`). Users need to record expenses, income, partial/full refunds, recurring bills, and categorized spending with exact financial precision, local transaction dates, and optional private file receipts.

Financial records have strict correctness requirements:

1. Floating-point IEEE 754 representations cause rounding drift (e.g. `0.1 + 0.2 !== 0.3`) and cannot be used for money.
2. Currencies have varying decimal exponents (e.g., JPY has 0 decimals, USD/BDT/EUR have 2 decimals, KWD/BHD have 3 decimals).
3. Different currencies must never be silently aggregated or coerced without an explicit exchange rate model (which is out of scope for initial manual tracking).
4. Refunds reduce category spending in the reporting period of the refund transaction date—they must never become income.
5. Over-refunding (cumulative active refunds exceeding the original expense amount) must be prevented under concurrency using database row locks (`FOR UPDATE`), not separate unchecked reads.
6. Receipt attachments must strictly reference verified, non-quarantined private files belonging to the exact same workspace.
7. External banking integrations, credit card linking, automatic transaction scraping, currency conversion, tax calculations, and financial advice are strictly excluded.

## Decisions

### 1. Exact Money Invariants & Representation

- **Storage**: Money amounts are stored as non-negative 64-bit integer minor units (`amount_minor_units bigint NOT NULL CHECK (amount_minor_units >= 0)`).
- **Currencies**: Every money record specifies an ISO 4217 currency code (e.g., `'USD'`, `'EUR'`, `'BDT'`, `'JPY'`, `'KWD'`). An authoritative registry defines the decimal exponent (0, 2, or 3).
- **Serialization**: APIs accept and serialize amounts as exact decimal strings (e.g., `"12.50"` or `"1000"`), validated against the currency's allowed decimal places. Fractional precision beyond the currency exponent (e.g. `"10.555"` for USD) is rejected with `ValidationError`.
- **Zero & Bounds**: Explicit zero amounts (`0`) are valid. Negative amounts are prohibited; refunds are modeled as a distinct record kind (`'refund'`), never as negative numbers. Amounts exceeding 64-bit integer limits are rejected.
- **Aggregations**: Summaries and totals are calculated using exact `BigInt` integer arithmetic and strictly partitioned per currency. Unrelated currencies are never combined.

### 2. Transaction Kinds and Lifecycle

- **Kinds**: Three record kinds exist: `'expense'`, `'income'`, and `'refund'`.
- **Transaction Date**: Every record has a `transaction_date` (`date`, formatted `YYYY-MM-DD`). Optional `occurred_at` (`timestamptz`) and `timezone` record precise local capture time. Monthly reporting and totals are keyed to `transaction_date`.
- **Categories**: User-defined categories (`app.expense_categories`) provide naming, icons, and colors. Categories are workspace-scoped. When a category is soft-deleted, existing records retain their `category_id` reference to preserve historical reporting, but new records cannot select deleted categories.

### 3. Refund Concurrency & Cumulative Limits

- **Original Reference**: A `'refund'` record MUST specify `original_expense_id`. The referenced original record must exist in the same workspace, must be of kind `'expense'`, and must have the same currency.
- **Reporting Semantics**: A refund reduces spending in the original category during the refund's `transaction_date` reporting period. It does not become income. If a refund occurs in a month after the original expense, it may produce negative net spending for that category in that later month, which is mathematically truthful.
- **Concurrency Protection**: During refund creation, editing, trash, or restore, the transaction acquires an exclusive row lock on the original expense (`SELECT ... FOR UPDATE`).
- **Cumulative Bound**: The sum of active (non-deleted) refunds referencing the original expense must never exceed the original expense's `amount_minor_units`. Any operation violating this bound is rejected.
- **Original Expense Safeguards**: An original expense cannot be deleted, trashed, reduced below its cumulative active refund total, or have its currency altered while active refund references exist.

### 4. Receipt Attachment Security

- When `receipt_file_id` is supplied, the backend verifies that the referenced file exists in `app.file_items`, belongs to the same workspace, is not deleted, and has status `'verified'` (quarantined or rejected files cannot be attached).

### 5. Recurrence Templates

- `app.expense_recurring_templates` define durable recurring rules with schedule (frequency, interval), start/end dates, timezone, and active state.
- Deduplication is tracked via `app.expense_recurring_occurrences` keyed on `(template_id, occurrence_date)`, guaranteeing idempotent generation across retries, restarts, and concurrent workers.

### 6. Scope Boundaries & Beta Isolation

- In accordance with Phase 38 boundaries, direct HTTP requests to `/v1/expenses` are gated with HTTP 403 in the private beta until Phase 40 release gates pass. Local API tests bypass this gate via local configuration or test server wiring.

## Consequences

- Guarantees financial math precision across web, mobile, and server without floating-point error.
- Prevents race conditions and over-refunding at the database transaction layer.
- Keeps expense tracking strictly personal, private, and offline-synchronizable.
