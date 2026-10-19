import type { PoolClient, Pool } from 'pg';
import crypto from 'node:crypto';
import type {
  ExpenseCategory,
  CreateExpenseCategoryBody,
  UpdateExpenseCategoryBody,
  ExpenseItem,
  CreateExpenseBody,
  UpdateExpenseBody,
  ExpenseListQuery,
  CurrencyMonthlySummary,
  ExpenseRecurringTemplate,
  CreateExpenseRecurringTemplateBody,
  ExpenseBudget,
  CreateExpenseBudgetBody,
  UpdateExpenseBudgetBody,
} from '@daynori/contracts';
import {
  getCurrencyInfo,
  parseDecimalToMinorUnits,
  formatMinorUnitsToDecimal,
  validateRefundBounds,
  calculateNetSpending,
  calculateNetSavings,
  getNextOccurrenceDate,
  isValidCalendarDate,
} from '@daynori/domain';
import {
  lockWorkspaceSyncState,
  insertChange,
  updateWorkspaceSyncSeq,
} from '../sync/repository.js';
import { ConflictError, NotFoundError, ValidationError } from '../../plugins/errorHandler.js';

export interface ExpenseItemDbRow {
  id: string;
  workspace_id: string;
  folder_id: string | null;
  kind: 'expense' | 'income' | 'refund';
  amount_minor_units: string;
  currency: string;
  transaction_date: string | Date;
  occurred_at: Date | null;
  timezone: string;
  category_id: string | null;
  category_name?: string | null;
  payment_label: string | null;
  note: string | null;
  receipt_file_id: string | null;
  original_expense_id: string | null;
  cumulative_refund_minor_units: string;
  revision: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function formatDateOnly(d: string | Date): string {
  if (typeof d === 'string') return d.slice(0, 10);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function encodeExpenseCursor(options: {
  workspaceId: string;
  transactionDate: string;
  id: string;
}): string {
  const raw = `${options.workspaceId}|${options.transactionDate}|${options.id}`;
  return Buffer.from(raw, 'utf-8').toString('base64url');
}

export function decodeExpenseCursor(
  cursor: string | undefined,
  expectedWorkspaceId: string
): { transactionDate: string; id: string } | null {
  if (!cursor || typeof cursor !== 'string') return null;
  if (cursor.length > 256) {
    throw new ValidationError('Pagination cursor exceeds maximum allowed length');
  }
  let raw: string;
  try {
    raw = Buffer.from(cursor, 'base64url').toString('utf-8');
  } catch {
    throw new ValidationError('Pagination cursor encoding is invalid');
  }
  const parts = raw.split('|');
  const wsId = parts[0];
  const txDate = parts[1];
  const id = parts[2];
  if (!wsId || !txDate || !id) {
    throw new ValidationError('Pagination cursor structure is invalid');
  }
  if (wsId !== expectedWorkspaceId) {
    throw new ValidationError('Pagination cursor belongs to a different workspace context');
  }
  return { transactionDate: txDate, id };
}

function mapRowToExpenseItem(row: ExpenseItemDbRow): ExpenseItem {
  const transactionDate = formatDateOnly(row.transaction_date);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    kind: row.kind,
    amountMinorUnits: row.amount_minor_units,
    amountFormatted: formatMinorUnitsToDecimal(BigInt(row.amount_minor_units), row.currency),
    currency: row.currency,
    transactionDate,
    occurredAt: row.occurred_at ? row.occurred_at.toISOString() : null,
    timezone: row.timezone || 'UTC',
    categoryId: row.category_id || null,
    categoryName: row.category_name ?? null,
    paymentLabel: row.payment_label || null,
    note: row.note || null,
    receiptFileId: row.receipt_file_id || null,
    originalExpenseId: row.original_expense_id || null,
    cumulativeRefundMinorUnits: row.cumulative_refund_minor_units || '0',
    folderId: row.folder_id || null,
    revision: Number(row.revision) || 1,
    deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

// -----------------------------------------------------------------------------
// Expense Categories
// -----------------------------------------------------------------------------

export async function createExpenseCategory(
  client: PoolClient,
  workspaceId: string,
  input: CreateExpenseCategoryBody,
  operationId?: string
): Promise<ExpenseCategory & { seq?: number }> {
  const trimmedName = input.name.trim();

  const dup = await client.query<{ id: string }>(
    `SELECT id FROM app.expense_categories
     WHERE workspace_id = $1 AND lower(trim(name)) = lower($2) AND deleted_at IS NULL;`,
    [workspaceId, trimmedName]
  );
  if (dup.rows.length > 0) {
    throw new ValidationError(`Expense category '${trimmedName}' already exists in this workspace`);
  }

  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  const res = await client.query<{
    id: string;
    workspace_id: string;
    name: string;
    color: string | null;
    icon: string | null;
    display_order: number;
    created_at: Date;
    updated_at: Date;
  }>(
    `INSERT INTO app.expense_categories (workspace_id, name, color, icon, display_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, workspace_id, name, color, icon, display_order, created_at, updated_at;`,
    [
      workspaceId,
      trimmedName,
      input.color ? input.color.trim() : null,
      input.icon ? input.icon.trim() : null,
      input.displayOrder ?? 0,
    ]
  );

  const row = res.rows[0]!;
  const seq = syncState.nextChangeSeq;

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'expense_category',
    entityId: row.id,
    revision: 1,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      name: row.name,
      color: row.color,
      icon: row.icon,
      displayOrder: row.display_order,
    },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    displayOrder: row.display_order,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    seq,
  };
}

export async function listExpenseCategories(
  client: PoolClient | Pool,
  workspaceId: string
): Promise<ExpenseCategory[]> {
  const res = await client.query<{
    id: string;
    workspace_id: string;
    name: string;
    color: string | null;
    icon: string | null;
    display_order: number;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, workspace_id, name, color, icon, display_order, created_at, updated_at
     FROM app.expense_categories
     WHERE workspace_id = $1 AND deleted_at IS NULL
     ORDER BY display_order ASC, name ASC;`,
    [workspaceId]
  );

  return res.rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    color: r.color,
    icon: r.icon,
    displayOrder: r.display_order,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));
}

export async function updateExpenseCategory(
  client: PoolClient,
  workspaceId: string,
  categoryId: string,
  input: UpdateExpenseCategoryBody,
  operationId?: string
): Promise<ExpenseCategory & { seq?: number }> {
  const existing = await client.query<{ id: string; name: string }>(
    `SELECT id, name FROM app.expense_categories
     WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL;`,
    [workspaceId, categoryId]
  );
  if (existing.rows.length === 0) {
    throw new NotFoundError(`Expense category ${categoryId} not found`);
  }

  if (input.name) {
    const trimmed = input.name.trim();
    const dup = await client.query<{ id: string }>(
      `SELECT id FROM app.expense_categories
       WHERE workspace_id = $1 AND lower(trim(name)) = lower($2) AND id != $3 AND deleted_at IS NULL;`,
      [workspaceId, trimmed, categoryId]
    );
    if (dup.rows.length > 0) {
      throw new ValidationError(`Expense category '${trimmed}' already exists`);
    }
  }

  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  const res = await client.query<{
    id: string;
    workspace_id: string;
    name: string;
    color: string | null;
    icon: string | null;
    display_order: number;
    created_at: Date;
    updated_at: Date;
  }>(
    `UPDATE app.expense_categories
     SET name = COALESCE($1, name),
         color = CASE WHEN $2::boolean THEN $3 ELSE color END,
         icon = CASE WHEN $4::boolean THEN $5 ELSE icon END,
         display_order = COALESCE($6, display_order),
         updated_at = now()
     WHERE workspace_id = $7 AND id = $8 AND deleted_at IS NULL
     RETURNING id, workspace_id, name, color, icon, display_order, created_at, updated_at;`,
    [
      input.name ? input.name.trim() : null,
      input.color !== undefined,
      input.color ? input.color.trim() : null,
      input.icon !== undefined,
      input.icon ? input.icon.trim() : null,
      input.displayOrder,
      workspaceId,
      categoryId,
    ]
  );

  const row = res.rows[0]!;
  const seq = syncState.nextChangeSeq;

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'expense_category',
    entityId: row.id,
    revision: 2,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      name: row.name,
      color: row.color,
      icon: row.icon,
      displayOrder: row.display_order,
    },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    displayOrder: row.display_order,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    seq,
  };
}

export async function deleteExpenseCategory(
  client: PoolClient,
  workspaceId: string,
  categoryId: string,
  operationId?: string
): Promise<{ success: boolean; id: string; seq?: number }> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM app.expense_categories
     WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL;`,
    [workspaceId, categoryId]
  );
  if (existing.rows.length === 0) {
    throw new NotFoundError(`Expense category ${categoryId} not found`);
  }

  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  await client.query(
    `UPDATE app.expense_categories
     SET deleted_at = now(), updated_at = now()
     WHERE workspace_id = $1 AND id = $2;`,
    [workspaceId, categoryId]
  );

  const seq = syncState.nextChangeSeq;

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'expense_category',
    entityId: categoryId,
    revision: 2,
    isTombstone: true,
    operationId: operationId || crypto.randomUUID(),
    changeData: { deleted: true },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return { success: true, id: categoryId, seq };
}

// -----------------------------------------------------------------------------
// Expense Records
// -----------------------------------------------------------------------------

export async function createExpenseRecord(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  input: CreateExpenseBody & { id?: string },
  operationId?: string
): Promise<ExpenseItem & { seq: number }> {
  const entryId = input.id || crypto.randomUUID();
  const kind = input.kind || 'expense';

  const currencyInfo = getCurrencyInfo(input.currency);
  const amountMinorUnits = parseDecimalToMinorUnits(input.amount, currencyInfo.code);

  if (!isValidCalendarDate(input.transactionDate)) {
    throw new ValidationError(`Invalid transactionDate: '${input.transactionDate}'`);
  }

  let categoryId = input.categoryId || null;
  if (categoryId) {
    const cRes = await client.query<{ id: string }>(
      `SELECT id FROM app.expense_categories
       WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL;`,
      [workspaceId, categoryId]
    );
    if (cRes.rows.length === 0) {
      throw new ValidationError(`Expense category ${categoryId} does not exist in this workspace`);
    }
  }

  if (input.folderId) {
    const fRes = await client.query<{ id: string }>(
      `SELECT id FROM app.items
       WHERE workspace_id = $1 AND id = $2 AND kind = 'folder' AND deleted_at IS NULL;`,
      [workspaceId, input.folderId]
    );
    if (fRes.rows.length === 0) {
      throw new ValidationError(`Folder ${input.folderId} does not exist in this workspace`);
    }
  }

  if (input.receiptFileId) {
    const fileRes = await client.query<{ id: string; quarantine_status: string }>(
      `SELECT f.id, f.quarantine_status FROM app.file_items f
       JOIN app.items i ON i.id = f.id
       WHERE f.workspace_id = $1 AND f.id = $2 AND i.deleted_at IS NULL;`,
      [workspaceId, input.receiptFileId]
    );
    if (fileRes.rows.length === 0) {
      throw new ValidationError('Receipt file must be an active file in the same workspace');
    }
    if (fileRes.rows[0]!.quarantine_status !== 'verified') {
      throw new ValidationError('Quarantined or rejected files cannot be attached as receipts');
    }
  }

  let originalExpenseId = input.originalExpenseId || null;

  if (kind === 'refund') {
    if (!originalExpenseId) {
      throw new ValidationError('A refund record must specify originalExpenseId');
    }

    // Atomically lock the original expense row
    const origRes = await client.query<{
      id: string;
      kind: string;
      amount_minor_units: string;
      currency: string;
      category_id: string | null;
      deleted_at: Date | null;
    }>(
      `SELECT e.id, e.kind, e.amount_minor_units, e.currency, e.category_id, i.deleted_at
       FROM app.expense_items e
       JOIN app.items i ON i.id = e.id
       WHERE e.workspace_id = $1 AND e.id = $2
       FOR UPDATE OF e;`,
      [workspaceId, originalExpenseId]
    );

    if (origRes.rows.length === 0) {
      throw new NotFoundError(`Original expense ${originalExpenseId} not found in this workspace`);
    }

    const orig = origRes.rows[0]!;
    if (orig.deleted_at) {
      throw new ValidationError('Cannot issue a refund against a deleted expense');
    }
    if (orig.kind !== 'expense') {
      throw new ValidationError(
        `Cannot issue a refund against record kind '${orig.kind}'. Only 'expense' records can be refunded.`
      );
    }
    if (orig.currency !== currencyInfo.code) {
      throw new ValidationError(
        `Refund currency (${currencyInfo.code}) does not match original expense currency (${orig.currency})`
      );
    }

    // Enforce approved original-category reporting policy: refund category MUST match original expense category
    if (categoryId && orig.category_id && categoryId !== orig.category_id) {
      throw new ValidationError('Refund category must match the original expense category');
    }
    categoryId = orig.category_id;

    // Calculate existing active refunds
    const sumRes = await client.query<{ sum: string | null }>(
      `SELECT SUM(e.amount_minor_units) as sum
       FROM app.expense_items e
       JOIN app.items i ON i.id = e.id
       WHERE e.workspace_id = $1 AND e.original_expense_id = $2 AND i.deleted_at IS NULL;`,
      [workspaceId, originalExpenseId]
    );

    const existingActiveRefunds = BigInt(sumRes.rows[0]?.sum || '0');
    const origAmount = BigInt(orig.amount_minor_units);

    // Enforce cumulative refund bounds
    validateRefundBounds(origAmount, existingActiveRefunds, amountMinorUnits);

    // Atomically increment cumulative_refund_minor_units on original expense
    const newCumulative = existingActiveRefunds + amountMinorUnits;
    await client.query(
      `UPDATE app.expense_items
       SET cumulative_refund_minor_units = $1, updated_at = now()
       WHERE workspace_id = $2 AND id = $3;`,
      [newCumulative.toString(), workspaceId, originalExpenseId]
    );
  } else {
    originalExpenseId = null;
  }

  // Acquire workspace sync lock
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  // Insert into app.items
  await client.query(
    `INSERT INTO app.items (
      id, workspace_id, folder_id, kind, created_by, updated_by,
      revision, rank, is_archived, is_pinned, security_scope
    ) VALUES ($1, $2, $3, 'expense', $4, $4, 1, '00001000', false, false, 'standard');`,
    [entryId, workspaceId, input.folderId || null, actorUserId]
  );

  // Insert into app.expense_items
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : null;
  const timezone = input.timezone || 'UTC';

  const expRes = await client.query<ExpenseItemDbRow>(
    `INSERT INTO app.expense_items (
      id, workspace_id, kind, amount_minor_units, currency, transaction_date,
      occurred_at, timezone, category_id, payment_label, note, receipt_file_id,
      original_expense_id, cumulative_refund_minor_units
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0)
    RETURNING id, workspace_id, kind, amount_minor_units, currency, transaction_date,
              occurred_at, timezone, category_id, payment_label, note, receipt_file_id,
              original_expense_id, cumulative_refund_minor_units, created_at, updated_at;`,
    [
      entryId,
      workspaceId,
      kind,
      amountMinorUnits.toString(),
      currencyInfo.code,
      input.transactionDate,
      occurredAt,
      timezone,
      categoryId,
      input.paymentLabel || null,
      input.note || null,
      input.receiptFileId || null,
      originalExpenseId,
    ]
  );

  const row = expRes.rows[0]!;
  row.folder_id = input.folderId || null;
  row.deleted_at = null;

  if (categoryId) {
    const cNameRes = await client.query<{ name: string }>(
      `SELECT name FROM app.expense_categories WHERE id = $1;`,
      [categoryId]
    );
    row.category_name = cNameRes.rows[0]?.name ?? null;
  }
  row.revision = 1;

  const seq = syncState.nextChangeSeq;

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'expense',
    entityId: entryId,
    revision: 1,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      kind: 'expense',
      expenseKind: kind,
      amountMinorUnits: amountMinorUnits.toString(),
      currency: currencyInfo.code,
      transactionDate: input.transactionDate,
      categoryId,
      receiptFileId: input.receiptFileId || null,
      originalExpenseId,
    },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return { ...mapRowToExpenseItem(row), seq };
}

export async function getExpenseRecord(
  client: PoolClient | Pool,
  workspaceId: string,
  expenseId: string
): Promise<ExpenseItem> {
  const res = await client.query<ExpenseItemDbRow>(
    `SELECT e.*, i.folder_id, i.deleted_at, i.revision, c.name as category_name
     FROM app.expense_items e
     JOIN app.items i ON i.id = e.id AND i.workspace_id = e.workspace_id
     LEFT JOIN app.expense_categories c ON c.id = e.category_id
     WHERE e.workspace_id = $1 AND e.id = $2;`,
    [workspaceId, expenseId]
  );

  if (res.rows.length === 0) {
    throw new NotFoundError(`Expense record ${expenseId} not found`);
  }

  return mapRowToExpenseItem(res.rows[0]!);
}

export async function listExpenseRecords(
  client: PoolClient | Pool,
  workspaceId: string,
  query: ExpenseListQuery
): Promise<{ items: ExpenseItem[]; nextCursor: string | null; hasMore: boolean }> {
  const conditions: string[] = ['e.workspace_id = $1', 'i.deleted_at IS NULL'];
  const params: unknown[] = [workspaceId];
  let pIdx = 2;

  if (query.year) {
    if (query.month) {
      const monthStr = String(query.month).padStart(2, '0');
      const start = `${query.year}-${monthStr}-01`;
      const nextMonth = query.month === 12 ? 1 : query.month + 1;
      const nextYear = query.month === 12 ? query.year + 1 : query.year;
      const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

      conditions.push(`e.transaction_date >= $${pIdx} AND e.transaction_date < $${pIdx + 1}`);
      params.push(start, end);
      pIdx += 2;
    } else {
      conditions.push(`e.transaction_date >= $${pIdx} AND e.transaction_date < $${pIdx + 1}`);
      params.push(`${query.year}-01-01`, `${query.year + 1}-01-01`);
      pIdx += 2;
    }
  }

  if (query.startDate) {
    conditions.push(`e.transaction_date >= $${pIdx}`);
    params.push(query.startDate);
    pIdx++;
  }

  if (query.endDate) {
    conditions.push(`e.transaction_date <= $${pIdx}`);
    params.push(query.endDate);
    pIdx++;
  }

  if (query.kind) {
    conditions.push(`e.kind = $${pIdx}`);
    params.push(query.kind);
    pIdx++;
  }

  if (query.categoryId) {
    conditions.push(`e.category_id = $${pIdx}`);
    params.push(query.categoryId);
    pIdx++;
  }

  if (query.currency) {
    conditions.push(`e.currency = $${pIdx}`);
    params.push(query.currency.toUpperCase());
    pIdx++;
  }

  if (query.folderId) {
    conditions.push(`i.folder_id = $${pIdx}`);
    params.push(query.folderId);
    pIdx++;
  }

  // Stable keyset cursor filtering
  if (query.cursor) {
    const decoded = decodeExpenseCursor(query.cursor, workspaceId);
    if (decoded) {
      conditions.push(
        `(e.transaction_date < $${pIdx} OR (e.transaction_date = $${pIdx} AND e.id < $${pIdx + 1}))`
      );
      params.push(decoded.transactionDate, decoded.id);
      pIdx += 2;
    }
  }

  const limit = Math.min(query.limit || 50, 200);

  // Fetch limit + 1 to detect whether there is a next page
  const res = await client.query<ExpenseItemDbRow>(
    `SELECT e.*, i.folder_id, i.deleted_at, i.revision, c.name as category_name
     FROM app.expense_items e
     JOIN app.items i ON i.id = e.id AND i.workspace_id = e.workspace_id
     LEFT JOIN app.expense_categories c ON c.id = e.category_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY e.transaction_date DESC, e.id DESC
     LIMIT $${pIdx};`,
    [...params, limit + 1]
  );

  const hasMore = res.rows.length > limit;
  const rows = hasMore ? res.rows.slice(0, limit) : res.rows;
  const items = rows.map(mapRowToExpenseItem);

  const lastRow = rows[rows.length - 1];
  const nextCursor =
    hasMore && lastRow
      ? encodeExpenseCursor({
          workspaceId,
          transactionDate: formatDateOnly(lastRow.transaction_date),
          id: lastRow.id,
        })
      : null;

  return { items, nextCursor, hasMore };
}

export async function updateExpenseRecord(
  client: PoolClient,
  workspaceId: string,
  expenseId: string,
  actorUserId: string,
  input: UpdateExpenseBody,
  operationId?: string
): Promise<ExpenseItem & { seq: number }> {
  // 1. Identify kind and original_expense_id
  const checkRes = await client.query<{
    kind: string;
    original_expense_id: string | null;
  }>(
    `SELECT kind, original_expense_id FROM app.expense_items WHERE workspace_id = $1 AND id = $2;`,
    [workspaceId, expenseId]
  );
  if (checkRes.rows.length === 0) {
    throw new NotFoundError(`Expense record ${expenseId} not found`);
  }
  const check = checkRes.rows[0]!;

  // Consistent lock order: If this is a refund, lock original expense FIRST, then lock the refund!
  if (check.kind === 'refund' && check.original_expense_id) {
    await client.query(
      `SELECT id FROM app.expense_items WHERE workspace_id = $1 AND id = $2 FOR UPDATE;`,
      [workspaceId, check.original_expense_id]
    );
  }

  // Lock current expense item row
  const curRes = await client.query<{
    id: string;
    kind: string;
    amount_minor_units: string;
    currency: string;
    category_id: string | null;
    original_expense_id: string | null;
    cumulative_refund_minor_units: string;
    deleted_at: Date | null;
    revision: number;
  }>(
    `SELECT e.id, e.kind, e.amount_minor_units, e.currency, e.category_id, e.original_expense_id,
            e.cumulative_refund_minor_units, i.deleted_at, i.revision
     FROM app.expense_items e
     JOIN app.items i ON i.id = e.id
     WHERE e.workspace_id = $1 AND e.id = $2
     FOR UPDATE OF e;`,
    [workspaceId, expenseId]
  );

  const current = curRes.rows[0]!;
  if (current.deleted_at) {
    throw new ValidationError('Cannot update a deleted expense record');
  }

  // Enforce optimistic revision check
  const expectedRev = input.baseRevision !== undefined ? input.baseRevision : input.expectedRevision;
  if (expectedRev !== undefined && expectedRev !== current.revision) {
    throw new ConflictError(
      `REVISION_CONFLICT: Expected baseRevision ${current.revision}, but received ${expectedRev}.`
    );
  }

  let newCurrency = current.currency;
  if (input.currency) {
    const cInfo = getCurrencyInfo(input.currency);
    newCurrency = cInfo.code;
    if (newCurrency !== current.currency) {
      if (current.kind === 'refund') {
        throw new ValidationError('Cannot change currency of a refund record independently');
      }
      const activeRefunds = BigInt(current.cumulative_refund_minor_units || '0');
      if (activeRefunds > 0n) {
        throw new ValidationError(
          'Cannot change currency of an expense that has active refund references'
        );
      }
    }
  }

  let newAmountMinorUnits = BigInt(current.amount_minor_units);
  if (input.amount !== undefined) {
    newAmountMinorUnits = parseDecimalToMinorUnits(input.amount, newCurrency);

    if (current.kind === 'expense') {
      const activeRefunds = BigInt(current.cumulative_refund_minor_units || '0');
      if (newAmountMinorUnits < activeRefunds) {
        throw new ValidationError(
          `Cannot reduce expense amount (${newAmountMinorUnits.toString()}) below cumulative active refunds (${activeRefunds.toString()})`
        );
      }
    } else if (current.kind === 'refund' && current.original_expense_id) {
      const origRes = await client.query<{ amount_minor_units: string }>(
        `SELECT amount_minor_units FROM app.expense_items
         WHERE workspace_id = $1 AND id = $2;`,
        [workspaceId, current.original_expense_id]
      );
      const origAmount = BigInt(origRes.rows[0]!.amount_minor_units);

      const otherRefundsRes = await client.query<{ sum: string | null }>(
        `SELECT SUM(e.amount_minor_units) as sum
         FROM app.expense_items e
         JOIN app.items i ON i.id = e.id
         WHERE e.workspace_id = $1 AND e.original_expense_id = $2 AND e.id != $3 AND i.deleted_at IS NULL;`,
        [workspaceId, current.original_expense_id, expenseId]
      );
      const otherRefunds = BigInt(otherRefundsRes.rows[0]?.sum || '0');

      validateRefundBounds(origAmount, otherRefunds, newAmountMinorUnits);

      await client.query(
        `UPDATE app.expense_items
         SET cumulative_refund_minor_units = $1, updated_at = now()
         WHERE workspace_id = $2 AND id = $3;`,
        [(otherRefunds + newAmountMinorUnits).toString(), workspaceId, current.original_expense_id]
      );
    }
  }

  if (input.transactionDate) {
    if (!isValidCalendarDate(input.transactionDate)) {
      throw new ValidationError(`Invalid transactionDate: '${input.transactionDate}'`);
    }
  }

  // Validate category if updating
  if (input.categoryId !== undefined && input.categoryId !== null) {
    const cRes = await client.query<{ id: string }>(
      `SELECT id FROM app.expense_categories
       WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL;`,
      [workspaceId, input.categoryId]
    );
    if (cRes.rows.length === 0) {
      throw new ValidationError(`Expense category ${input.categoryId} does not exist in this workspace`);
    }
  }

  // Enforce category policy on refunds
  if (current.kind === 'refund') {
    if (input.categoryId !== undefined && input.categoryId !== current.category_id) {
      throw new ValidationError('Refund category cannot be changed independently from the original expense');
    }
  }

  // Validate receipt if updating
  if (input.receiptFileId !== undefined && input.receiptFileId !== null) {
    const fileRes = await client.query<{ id: string; quarantine_status: string }>(
      `SELECT f.id, f.quarantine_status FROM app.file_items f
       JOIN app.items i ON i.id = f.id
       WHERE f.workspace_id = $1 AND f.id = $2 AND i.deleted_at IS NULL;`,
      [workspaceId, input.receiptFileId]
    );
    if (fileRes.rows.length === 0 || fileRes.rows[0]!.quarantine_status !== 'verified') {
      throw new ValidationError(
        'Receipt file must be an active, verified file in the same workspace'
      );
    }
  }

  // Validate and handle folder update (honor folderId: null as moving to root)
  if (input.folderId !== undefined) {
    if (input.folderId === null) {
      await client.query(
        `UPDATE app.items SET folder_id = NULL, updated_by = $1, updated_at = now() WHERE id = $2;`,
        [actorUserId, expenseId]
      );
    } else {
      const fRes = await client.query<{ id: string }>(
        `SELECT id FROM app.items
         WHERE workspace_id = $1 AND id = $2 AND kind = 'folder' AND deleted_at IS NULL;`,
        [workspaceId, input.folderId]
      );
      if (fRes.rows.length === 0) {
        throw new ValidationError(`Folder ${input.folderId} does not exist in this workspace`);
      }
      await client.query(
        `UPDATE app.items SET folder_id = $1, updated_by = $2, updated_at = now() WHERE id = $3;`,
        [input.folderId, actorUserId, expenseId]
      );
    }
  }

  // If changing original expense category, keep linked refunds updated
  if (current.kind === 'expense' && input.categoryId !== undefined) {
    await client.query(
      `UPDATE app.expense_items
       SET category_id = $1, updated_at = now()
       WHERE workspace_id = $2 AND original_expense_id = $3;`,
      [input.categoryId || null, workspaceId, expenseId]
    );
  }

  // Update app.expense_items
  const occurredAt =
    input.occurredAt !== undefined
      ? input.occurredAt
        ? new Date(input.occurredAt)
        : null
      : undefined;

  await client.query(
    `UPDATE app.expense_items
     SET amount_minor_units = $1,
         currency = $2,
         transaction_date = COALESCE($3, transaction_date),
         occurred_at = CASE WHEN $4::boolean THEN $5 ELSE occurred_at END,
         timezone = COALESCE($6, timezone),
         category_id = CASE WHEN $7::boolean THEN $8 ELSE category_id END,
         payment_label = CASE WHEN $9::boolean THEN $10 ELSE payment_label END,
         note = CASE WHEN $11::boolean THEN $12 ELSE note END,
         receipt_file_id = CASE WHEN $13::boolean THEN $14 ELSE receipt_file_id END,
         updated_at = now()
     WHERE workspace_id = $15 AND id = $16;`,
    [
      newAmountMinorUnits.toString(),
      newCurrency,
      input.transactionDate || null,
      input.occurredAt !== undefined,
      occurredAt,
      input.timezone || null,
      input.categoryId !== undefined,
      input.categoryId || null,
      input.paymentLabel !== undefined,
      input.paymentLabel || null,
      input.note !== undefined,
      input.note || null,
      input.receiptFileId !== undefined,
      input.receiptFileId || null,
      workspaceId,
      expenseId,
    ]
  );

  // Monotonically increment persisted revision in app.items
  const revRes = await client.query<{ revision: number }>(
    `UPDATE app.items
     SET revision = revision + 1, updated_by = $1, updated_at = now()
     WHERE workspace_id = $2 AND id = $3
     RETURNING revision;`,
    [actorUserId, workspaceId, expenseId]
  );
  const finalRevision = revRes.rows[0]?.revision ?? 2;

  // Retrieve complete updated row including folder_id and category_name
  const rowRes = await client.query<ExpenseItemDbRow>(
    `SELECT e.*, i.folder_id, i.deleted_at, i.revision, c.name as category_name
     FROM app.expense_items e
     JOIN app.items i ON i.id = e.id AND i.workspace_id = e.workspace_id
     LEFT JOIN app.expense_categories c ON c.id = e.category_id
     WHERE e.workspace_id = $1 AND e.id = $2;`,
    [workspaceId, expenseId]
  );
  const row = rowRes.rows[0]!;

  // Sync state & change feed
  const syncState = await lockWorkspaceSyncState(client, workspaceId);
  const seq = syncState.nextChangeSeq;

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'expense',
    entityId: expenseId,
    revision: finalRevision,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      kind: 'expense',
      action: 'updated',
      amountMinorUnits: newAmountMinorUnits.toString(),
      currency: newCurrency,
      transactionDate: formatDateOnly(row.transaction_date),
      categoryId: row.category_id,
      folderId: row.folder_id,
    },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return { ...mapRowToExpenseItem(row), seq };
}

export async function trashExpenseRecord(
  client: PoolClient,
  workspaceId: string,
  expenseId: string,
  actorUserId: string,
  operationId?: string
): Promise<{ success: boolean; id: string; seq: number; revision: number }> {
  // 1. Identify kind and original_expense_id
  const checkRes = await client.query<{
    kind: string;
    original_expense_id: string | null;
  }>(
    `SELECT kind, original_expense_id FROM app.expense_items WHERE workspace_id = $1 AND id = $2;`,
    [workspaceId, expenseId]
  );
  if (checkRes.rows.length === 0) {
    throw new NotFoundError(`Expense record ${expenseId} not found`);
  }
  const check = checkRes.rows[0]!;

  // Consistent lock order: If refund, lock original expense first
  if (check.kind === 'refund' && check.original_expense_id) {
    await client.query(
      `SELECT id FROM app.expense_items WHERE workspace_id = $1 AND id = $2 FOR UPDATE;`,
      [workspaceId, check.original_expense_id]
    );
  }

  // Lock expense item row
  const expRes = await client.query<{
    id: string;
    kind: string;
    amount_minor_units: string;
    original_expense_id: string | null;
    cumulative_refund_minor_units: string;
    deleted_at: Date | null;
  }>(
    `SELECT e.id, e.kind, e.amount_minor_units, e.original_expense_id,
            e.cumulative_refund_minor_units, i.deleted_at
     FROM app.expense_items e
     JOIN app.items i ON i.id = e.id
     WHERE e.workspace_id = $1 AND e.id = $2
     FOR UPDATE OF e;`,
    [workspaceId, expenseId]
  );

  const exp = expRes.rows[0]!;
  if (exp.deleted_at) {
    return { success: true, id: expenseId, seq: 0, revision: 1 };
  }

  // Invariant: Cannot trash an original expense while active refunds reference it!
  if (exp.kind === 'expense') {
    const activeRefundsRes = await client.query<{ count: string; sum: string | null }>(
      `SELECT COUNT(*) as count, SUM(e.amount_minor_units) as sum
       FROM app.expense_items e
       JOIN app.items i ON i.id = e.id
       WHERE e.workspace_id = $1 AND e.original_expense_id = $2 AND i.deleted_at IS NULL;`,
      [workspaceId, expenseId]
    );
    const activeRefundsCount = parseInt(activeRefundsRes.rows[0]?.count || '0', 10);
    if (activeRefundsCount > 0) {
      throw new ValidationError(
        'Cannot delete expense with active refund references. Revert or trash active refunds first.'
      );
    }
  }

  // If trashing a refund, atomically recompute and update cumulative_refund_minor_units on original expense
  if (exp.kind === 'refund' && exp.original_expense_id) {
    const sumRes = await client.query<{ sum: string | null }>(
      `SELECT SUM(e.amount_minor_units) as sum
       FROM app.expense_items e
       JOIN app.items i ON i.id = e.id
       WHERE e.workspace_id = $1 AND e.original_expense_id = $2 AND e.id != $3 AND i.deleted_at IS NULL;`,
      [workspaceId, exp.original_expense_id, expenseId]
    );
    const remainingActive = BigInt(sumRes.rows[0]?.sum || '0');
    await client.query(
      `UPDATE app.expense_items
       SET cumulative_refund_minor_units = $1, updated_at = now()
       WHERE workspace_id = $2 AND id = $3;`,
      [remainingActive.toString(), workspaceId, exp.original_expense_id]
    );
  }

  // Soft delete in app.items and increment revision
  const revRes = await client.query<{ revision: number }>(
    `UPDATE app.items
     SET deleted_at = now(), updated_by = $1, revision = revision + 1
     WHERE workspace_id = $2 AND id = $3
     RETURNING revision;`,
    [actorUserId, workspaceId, expenseId]
  );
  const finalRevision = revRes.rows[0]?.revision ?? 2;

  // Sync state & change feed
  const syncState = await lockWorkspaceSyncState(client, workspaceId);
  const seq = syncState.nextChangeSeq;

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'expense',
    entityId: expenseId,
    revision: finalRevision,
    isTombstone: true,
    operationId: operationId || crypto.randomUUID(),
    changeData: { kind: 'expense', action: 'trashed' },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return { success: true, id: expenseId, seq, revision: finalRevision };
}

export async function restoreExpenseRecord(
  client: PoolClient,
  workspaceId: string,
  expenseId: string,
  actorUserId: string,
  operationId?: string
): Promise<{ success: boolean; id: string; seq: number; revision: number }> {
  // 1. Identify kind and original_expense_id
  const checkRes = await client.query<{
    kind: string;
    original_expense_id: string | null;
  }>(
    `SELECT kind, original_expense_id FROM app.expense_items WHERE workspace_id = $1 AND id = $2;`,
    [workspaceId, expenseId]
  );
  if (checkRes.rows.length === 0) {
    throw new NotFoundError(`Expense record ${expenseId} not found`);
  }
  const check = checkRes.rows[0]!;

  // Consistent lock order: If refund, lock original expense first
  if (check.kind === 'refund' && check.original_expense_id) {
    await client.query(
      `SELECT id FROM app.expense_items WHERE workspace_id = $1 AND id = $2 FOR UPDATE;`,
      [workspaceId, check.original_expense_id]
    );
  }

  // Lock expense item row
  const expRes = await client.query<{
    id: string;
    kind: string;
    amount_minor_units: string;
    original_expense_id: string | null;
    deleted_at: Date | null;
  }>(
    `SELECT e.id, e.kind, e.amount_minor_units, e.original_expense_id, i.deleted_at
     FROM app.expense_items e
     JOIN app.items i ON i.id = e.id
     WHERE e.workspace_id = $1 AND e.id = $2
     FOR UPDATE OF e;`,
    [workspaceId, expenseId]
  );

  const exp = expRes.rows[0]!;
  if (!exp.deleted_at) {
    return { success: true, id: expenseId, seq: 0, revision: 1 };
  }

  // If restoring a refund, ensure original expense is still active and bounds are respected
  if (exp.kind === 'refund' && exp.original_expense_id) {
    const origRes = await client.query<{
      amount_minor_units: string;
      deleted_at: Date | null;
    }>(
      `SELECT e.amount_minor_units, i.deleted_at
       FROM app.expense_items e
       JOIN app.items i ON i.id = e.id
       WHERE e.workspace_id = $1 AND e.id = $2;`,
      [workspaceId, exp.original_expense_id]
    );

    if (origRes.rows.length === 0 || origRes.rows[0]!.deleted_at !== null) {
      throw new ValidationError('Cannot restore refund because original expense is deleted');
    }

    const origAmount = BigInt(origRes.rows[0]!.amount_minor_units);
    const refundAmount = BigInt(exp.amount_minor_units);

    const activeOtherRefunds = await client.query<{ sum: string | null }>(
      `SELECT SUM(e.amount_minor_units) as sum
       FROM app.expense_items e
       JOIN app.items i ON i.id = e.id
       WHERE e.workspace_id = $1 AND e.original_expense_id = $2 AND e.id != $3 AND i.deleted_at IS NULL;`,
      [workspaceId, exp.original_expense_id, expenseId]
    );
    const otherSum = BigInt(activeOtherRefunds.rows[0]?.sum || '0');

    validateRefundBounds(origAmount, otherSum, refundAmount);

    const newCumulative = otherSum + refundAmount;
    await client.query(
      `UPDATE app.expense_items
       SET cumulative_refund_minor_units = $1, updated_at = now()
       WHERE workspace_id = $2 AND id = $3;`,
      [newCumulative.toString(), workspaceId, exp.original_expense_id]
    );
  }

  // Restore in app.items and increment revision
  const revRes = await client.query<{ revision: number }>(
    `UPDATE app.items
     SET deleted_at = NULL, updated_by = $1, revision = revision + 1
     WHERE workspace_id = $2 AND id = $3
     RETURNING revision;`,
    [actorUserId, workspaceId, expenseId]
  );
  const finalRevision = revRes.rows[0]?.revision ?? 2;

  // Sync state & change feed
  const syncState = await lockWorkspaceSyncState(client, workspaceId);
  const seq = syncState.nextChangeSeq;

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'expense',
    entityId: expenseId,
    revision: finalRevision,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: { kind: 'expense', action: 'restored' },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return { success: true, id: expenseId, seq, revision: finalRevision };
}

// -----------------------------------------------------------------------------
// Monthly Summaries & Per-Currency Aggregations
// -----------------------------------------------------------------------------

export async function getExpenseMonthlySummary(
  client: PoolClient | Pool,
  workspaceId: string,
  year: number,
  month: number
): Promise<CurrencyMonthlySummary[]> {
  const monthStr = String(month).padStart(2, '0');
  const startOfMonth = `${year}-${monthStr}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endOfMonth = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  // Fetch all active items in reporting month
  // Join original expense to ensure original-category reporting policy is respected
  const itemsRes = await client.query<{
    kind: 'expense' | 'income' | 'refund';
    amount_minor_units: string;
    currency: string;
    category_id: string | null;
    category_name: string | null;
    category_color: string | null;
  }>(
    `SELECT e.kind, e.amount_minor_units, e.currency,
            COALESCE(e.category_id, orig.category_id) as category_id,
            COALESCE(c.name, oc.name) as category_name,
            COALESCE(c.color, oc.color) as category_color
     FROM app.expense_items e
     JOIN app.items i ON i.id = e.id AND i.workspace_id = e.workspace_id
     LEFT JOIN app.expense_items orig ON orig.id = e.original_expense_id
     LEFT JOIN app.expense_categories c ON c.id = e.category_id
     LEFT JOIN app.expense_categories oc ON oc.id = orig.category_id
     WHERE e.workspace_id = $1
       AND i.deleted_at IS NULL
       AND e.transaction_date >= $2
       AND e.transaction_date < $3
     ORDER BY e.currency, e.transaction_date;`,
    [workspaceId, startOfMonth, endOfMonth]
  );

  // Group strictly by currency
  const currencyGroups = new Map<
    string,
    {
      incomeTotal: bigint;
      grossExpenseTotal: bigint;
      refundTotal: bigint;
      txCount: number;
      categories: Map<
        string,
        {
          categoryId: string | null;
          categoryName: string;
          categoryColor: string | null;
          spentMinorUnits: bigint;
          count: number;
        }
      >;
    }
  >();

  for (const row of itemsRes.rows) {
    const cur = row.currency;
    if (!currencyGroups.has(cur)) {
      currencyGroups.set(cur, {
        incomeTotal: 0n,
        grossExpenseTotal: 0n,
        refundTotal: 0n,
        txCount: 0,
        categories: new Map(),
      });
    }

    const group = currencyGroups.get(cur)!;
    const amount = BigInt(row.amount_minor_units);
    group.txCount++;

    const catKey = row.category_id || 'uncategorized';
    if (!group.categories.has(catKey)) {
      group.categories.set(catKey, {
        categoryId: row.category_id,
        categoryName: row.category_name || 'Uncategorized',
        categoryColor: row.category_color,
        spentMinorUnits: 0n,
        count: 0,
      });
    }
    const catEntry = group.categories.get(catKey)!;

    if (row.kind === 'income') {
      group.incomeTotal += amount;
    } else if (row.kind === 'expense') {
      group.grossExpenseTotal += amount;
      catEntry.spentMinorUnits += amount;
      catEntry.count++;
    } else if (row.kind === 'refund') {
      group.refundTotal += amount;
      catEntry.spentMinorUnits -= amount;
      catEntry.count++;
    }
  }

  const summaries: CurrencyMonthlySummary[] = [];

  for (const [currency, data] of currencyGroups.entries()) {
    const netExpense = calculateNetSpending(data.grossExpenseTotal, data.refundTotal);
    const netSavings = calculateNetSavings(data.incomeTotal, netExpense);

    const categoryBreakdown = Array.from(data.categories.values()).map((c) => ({
      categoryId: c.categoryId,
      categoryName: c.categoryName,
      categoryColor: c.categoryColor,
      spentMinorUnits: c.spentMinorUnits.toString(),
      spentFormatted:
        c.spentMinorUnits < 0n
          ? `-${formatMinorUnitsToDecimal(-c.spentMinorUnits, currency)}`
          : formatMinorUnitsToDecimal(c.spentMinorUnits, currency),
      transactionCount: c.count,
    }));

    summaries.push({
      currency,
      totalIncomeMinorUnits: data.incomeTotal.toString(),
      totalIncomeFormatted: formatMinorUnitsToDecimal(data.incomeTotal, currency),
      grossExpenseMinorUnits: data.grossExpenseTotal.toString(),
      grossExpenseFormatted: formatMinorUnitsToDecimal(data.grossExpenseTotal, currency),
      totalRefundMinorUnits: data.refundTotal.toString(),
      totalRefundFormatted: formatMinorUnitsToDecimal(data.refundTotal, currency),
      netExpenseMinorUnits: netExpense.toString(),
      netExpenseFormatted:
        netExpense < 0n
          ? `-${formatMinorUnitsToDecimal(-netExpense, currency)}`
          : formatMinorUnitsToDecimal(netExpense, currency),
      netSavingsMinorUnits: netSavings.toString(),
      netSavingsFormatted:
        netSavings < 0n
          ? `-${formatMinorUnitsToDecimal(-netSavings, currency)}`
          : formatMinorUnitsToDecimal(netSavings, currency),
      categoryBreakdown,
      transactionCount: data.txCount,
    });
  }

  return summaries;
}

// -----------------------------------------------------------------------------
// Recurring Templates & Occurrence Generation
// -----------------------------------------------------------------------------

export async function createExpenseRecurringTemplate(
  client: PoolClient,
  workspaceId: string,
  input: CreateExpenseRecurringTemplateBody,
  operationId?: string
): Promise<ExpenseRecurringTemplate & { seq?: number }> {
  const currencyInfo = getCurrencyInfo(input.currency);
  const amountMinorUnits = parseDecimalToMinorUnits(input.amount, currencyInfo.code);

  if (!isValidCalendarDate(input.startDate)) {
    throw new ValidationError(`Invalid startDate: '${input.startDate}'`);
  }
  if (input.endDate && !isValidCalendarDate(input.endDate)) {
    throw new ValidationError(`Invalid endDate: '${input.endDate}'`);
  }

  let categoryId = input.categoryId || null;
  if (categoryId) {
    const cRes = await client.query<{ id: string }>(
      `SELECT id FROM app.expense_categories
       WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL;`,
      [workspaceId, categoryId]
    );
    if (cRes.rows.length === 0) {
      throw new ValidationError(`Expense category ${categoryId} does not exist in this workspace`);
    }
  }

  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  const res = await client.query<{
    id: string;
    workspace_id: string;
    title: string;
    kind: 'expense' | 'income';
    amount_minor_units: string;
    currency: string;
    category_id: string | null;
    payment_label: string | null;
    note: string | null;
    schedule: unknown;
    timezone: string;
    start_date: string | Date;
    end_date: string | Date | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `INSERT INTO app.expense_recurring_templates (
      workspace_id, title, kind, amount_minor_units, currency,
      category_id, payment_label, note, schedule, timezone,
      start_date, end_date, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *;`,
    [
      workspaceId,
      input.title.trim(),
      input.kind,
      amountMinorUnits.toString(),
      currencyInfo.code,
      categoryId,
      input.paymentLabel || null,
      input.note || null,
      JSON.stringify(input.schedule),
      input.timezone || 'UTC',
      input.startDate,
      input.endDate || null,
      input.isActive ?? true,
    ]
  );

  const row = res.rows[0]!;
  const seq = syncState.nextChangeSeq;

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'expense_recurring_template',
    entityId: row.id,
    revision: 1,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      title: row.title,
      kind: row.kind,
      amountMinorUnits: row.amount_minor_units,
      currency: row.currency,
      schedule: row.schedule,
    },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    kind: row.kind,
    amountMinorUnits: row.amount_minor_units,
    amountFormatted: formatMinorUnitsToDecimal(BigInt(row.amount_minor_units), row.currency),
    currency: row.currency,
    categoryId: row.category_id,
    paymentLabel: row.payment_label,
    note: row.note,
    schedule: row.schedule as ExpenseRecurringTemplate['schedule'],
    timezone: row.timezone,
    startDate: formatDateOnly(row.start_date),
    endDate: row.end_date ? formatDateOnly(row.end_date) : null,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    seq,
  };
}

export async function listExpenseRecurringTemplates(
  client: PoolClient | Pool,
  workspaceId: string
): Promise<ExpenseRecurringTemplate[]> {
  const res = await client.query<{
    id: string;
    workspace_id: string;
    title: string;
    kind: 'expense' | 'income';
    amount_minor_units: string;
    currency: string;
    category_id: string | null;
    payment_label: string | null;
    note: string | null;
    schedule: unknown;
    timezone: string;
    start_date: string | Date;
    end_date: string | Date | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT * FROM app.expense_recurring_templates
     WHERE workspace_id = $1
     ORDER BY is_active DESC, created_at DESC;`,
    [workspaceId]
  );

  return res.rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    title: r.title,
    kind: r.kind,
    amountMinorUnits: r.amount_minor_units,
    amountFormatted: formatMinorUnitsToDecimal(BigInt(r.amount_minor_units), r.currency),
    currency: r.currency,
    categoryId: r.category_id,
    paymentLabel: r.payment_label,
    note: r.note,
    schedule: r.schedule as ExpenseRecurringTemplate['schedule'],
    timezone: r.timezone,
    startDate: formatDateOnly(r.start_date),
    endDate: r.end_date ? formatDateOnly(r.end_date) : null,
    isActive: r.is_active,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));
}

/**
 * Generates pending recurring occurrences up to target date with atomic claim deduplication.
 * Prevents race conditions and orphan expense records by atomically reserving (template_id, occurrence_date)
 * BEFORE calling createExpenseRecord.
 */
export async function generateRecurringOccurrences(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  untilDateStr: string
): Promise<{ generatedCount: number; expenseIds: string[] }> {
  if (!isValidCalendarDate(untilDateStr)) {
    throw new ValidationError(`Invalid untilDate: '${untilDateStr}'`);
  }

  // Bound generation window to at most 366 days in the future
  const maxFutureDate = new Date();
  maxFutureDate.setUTCDate(maxFutureDate.getUTCDate() + 366);
  const maxFutureDateStr = maxFutureDate.toISOString().split('T')[0]!;
  if (untilDateStr > maxFutureDateStr) {
    throw new ValidationError(
      `Generation untilDate cannot exceed 1 year into the future (${maxFutureDateStr})`
    );
  }

  const templates = await listExpenseRecurringTemplates(client, workspaceId);
  const expenseIds: string[] = [];
  const MAX_TOTAL_GENERATIONS = 500;

  for (const t of templates) {
    if (!t.isActive) continue;

    let nextDate: string | null = t.startDate;
    while (nextDate && nextDate <= untilDateStr) {
      if (expenseIds.length >= MAX_TOTAL_GENERATIONS) {
        break;
      }

      // 1. Atomically claim occurrence reservation before creating expense
      const claimRes = await client.query<{ occurrence_date: string }>(
        `INSERT INTO app.expense_recurring_occurrences (template_id, occurrence_date, expense_id)
         VALUES ($1, $2, NULL)
         ON CONFLICT (template_id, occurrence_date) DO NOTHING
         RETURNING occurrence_date;`,
        [t.id, nextDate]
      );

      if (claimRes.rows.length > 0) {
        // We won the atomic claim for this occurrence!
        const created = await createExpenseRecord(client, workspaceId, actorUserId, {
          kind: t.kind,
          amount: t.amountFormatted,
          currency: t.currency,
          transactionDate: nextDate,
          timezone: t.timezone,
          categoryId: t.categoryId,
          paymentLabel: t.paymentLabel,
          note: t.note ? `[Recurring: ${t.title}] ${t.note}` : `[Recurring: ${t.title}]`,
        });

        // Update occurrence with created expense ID
        await client.query(
          `UPDATE app.expense_recurring_occurrences
           SET expense_id = $1
           WHERE template_id = $2 AND occurrence_date = $3;`,
          [created.id, t.id, nextDate]
        );

        expenseIds.push(created.id);
      }

      nextDate = getNextOccurrenceDate(t.schedule, t.startDate, nextDate, t.endDate || undefined);
    }
  }

  return { generatedCount: expenseIds.length, expenseIds };
}

// -----------------------------------------------------------------------------
// Budgets (Phase 40)
// -----------------------------------------------------------------------------

export async function createExpenseBudget(
  client: PoolClient,
  workspaceId: string,
  input: CreateExpenseBudgetBody,
  operationId?: string
): Promise<ExpenseBudget & { seq?: number }> {
  const currencyInfo = getCurrencyInfo(input.currency);
  const amountMinorUnits = parseDecimalToMinorUnits(input.amount, currencyInfo.code);

  let categoryId = input.categoryId || null;
  if (categoryId) {
    const cRes = await client.query<{ id: string }>(
      `SELECT id FROM app.expense_categories
       WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL;`,
      [workspaceId, categoryId]
    );
    if (cRes.rows.length === 0) {
      throw new ValidationError(`Expense category ${categoryId} does not exist in this workspace`);
    }
  }

  // Check unique active budget for (workspace, period, currency, categoryId)
  const dupRes = await client.query<{ id: string }>(
    `SELECT id FROM app.expense_budgets
     WHERE workspace_id = $1
       AND period = $2
       AND currency = $3
       AND (category_id IS NOT DISTINCT FROM $4)
       AND deleted_at IS NULL;`,
    [workspaceId, input.period, currencyInfo.code, categoryId]
  );
  if (dupRes.rows.length > 0) {
    throw new ValidationError(
      `A budget for period '${input.period}', currency '${currencyInfo.code}' and ${
        categoryId ? `category '${categoryId}'` : 'overall spending'
      } already exists.`
    );
  }

  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  const res = await client.query<{
    id: string;
    workspace_id: string;
    period: string;
    currency: string;
    category_id: string | null;
    amount_minor_units: string;
    revision: number;
    created_at: Date;
    updated_at: Date;
  }>(
    `INSERT INTO app.expense_budgets (
      workspace_id, period, currency, category_id, amount_minor_units, revision
    ) VALUES ($1, $2, $3, $4, $5, 1)
    RETURNING id, workspace_id, period, currency, category_id, amount_minor_units, revision, created_at, updated_at;`,
    [workspaceId, input.period, currencyInfo.code, categoryId, amountMinorUnits.toString()]
  );

  const row = res.rows[0]!;
  const seq = syncState.nextChangeSeq;

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'expense_budget',
    entityId: row.id,
    revision: 1,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      period: row.period,
      currency: row.currency,
      categoryId: row.category_id,
      amountMinorUnits: row.amount_minor_units,
    },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    period: row.period,
    currency: row.currency,
    categoryId: row.category_id,
    amountMinorUnits: row.amount_minor_units,
    amountFormatted: formatMinorUnitsToDecimal(BigInt(row.amount_minor_units), row.currency),
    revision: row.revision,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    seq,
  };
}

export async function listExpenseBudgets(
  client: PoolClient | Pool,
  workspaceId: string,
  query?: { period?: string; currency?: string }
): Promise<ExpenseBudget[]> {
  const conditions = ['b.workspace_id = $1', 'b.deleted_at IS NULL'];
  const params: unknown[] = [workspaceId];
  let pIdx = 2;

  if (query?.period) {
    conditions.push(`b.period = $${pIdx}`);
    params.push(query.period);
    pIdx++;
  }

  if (query?.currency) {
    conditions.push(`b.currency = $${pIdx}`);
    params.push(query.currency.toUpperCase());
    pIdx++;
  }

  const res = await client.query<{
    id: string;
    workspace_id: string;
    period: string;
    currency: string;
    category_id: string | null;
    category_name: string | null;
    amount_minor_units: string;
    revision: number;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT b.*, c.name as category_name
     FROM app.expense_budgets b
     LEFT JOIN app.expense_categories c ON c.id = b.category_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY b.period DESC, b.currency ASC, c.name ASC;`,
    params
  );

  const budgets: ExpenseBudget[] = [];

  for (const row of res.rows) {
    // Calculate net spending in the period for this budget
    const startOfMonth = `${row.period}-01`;
    const parts = row.period.split('-');
    const y = parseInt(parts[0]!, 10);
    const m = parseInt(parts[1]!, 10);
    const nextM = m === 12 ? 1 : m + 1;
    const nextY = m === 12 ? y + 1 : y;
    const endOfMonth = `${nextY}-${String(nextM).padStart(2, '0')}-01`;

    let spentMinorUnits = 0n;
    if (row.category_id) {
      // Category budget net spending
      const spentRes = await client.query<{ sum: string | null }>(
        `SELECT
           SUM(CASE WHEN e.kind = 'expense' THEN e.amount_minor_units
                    WHEN e.kind = 'refund' THEN -e.amount_minor_units
                    ELSE 0 END) as sum
         FROM app.expense_items e
         JOIN app.items i ON i.id = e.id AND i.workspace_id = e.workspace_id
         LEFT JOIN app.expense_items orig ON orig.id = e.original_expense_id
         WHERE e.workspace_id = $1
           AND e.currency = $2
           AND COALESCE(e.category_id, orig.category_id) = $3
           AND e.transaction_date >= $4
           AND e.transaction_date < $5
           AND i.deleted_at IS NULL;`,
        [workspaceId, row.currency, row.category_id, startOfMonth, endOfMonth]
      );
      spentMinorUnits = BigInt(spentRes.rows[0]?.sum || '0');
    } else {
      // Overall monthly budget net spending
      const spentRes = await client.query<{ sum: string | null }>(
        `SELECT
           SUM(CASE WHEN e.kind = 'expense' THEN e.amount_minor_units
                    WHEN e.kind = 'refund' THEN -e.amount_minor_units
                    ELSE 0 END) as sum
         FROM app.expense_items e
         JOIN app.items i ON i.id = e.id AND i.workspace_id = e.workspace_id
         WHERE e.workspace_id = $1
           AND e.currency = $2
           AND e.kind IN ('expense', 'refund')
           AND e.transaction_date >= $3
           AND e.transaction_date < $4
           AND i.deleted_at IS NULL;`,
        [workspaceId, row.currency, startOfMonth, endOfMonth]
      );
      spentMinorUnits = BigInt(spentRes.rows[0]?.sum || '0');
    }

    const budgetAmount = BigInt(row.amount_minor_units);
    const remainingMinorUnits = budgetAmount - spentMinorUnits;

    budgets.push({
      id: row.id,
      workspaceId: row.workspace_id,
      period: row.period,
      currency: row.currency,
      categoryId: row.category_id,
      categoryName: row.category_name,
      amountMinorUnits: row.amount_minor_units,
      amountFormatted: formatMinorUnitsToDecimal(budgetAmount, row.currency),
      spentMinorUnits: spentMinorUnits.toString(),
      spentFormatted:
        spentMinorUnits < 0n
          ? `-${formatMinorUnitsToDecimal(-spentMinorUnits, row.currency)}`
          : formatMinorUnitsToDecimal(spentMinorUnits, row.currency),
      remainingMinorUnits: remainingMinorUnits.toString(),
      remainingFormatted:
        remainingMinorUnits < 0n
          ? `-${formatMinorUnitsToDecimal(-remainingMinorUnits, row.currency)}`
          : formatMinorUnitsToDecimal(remainingMinorUnits, row.currency),
      revision: row.revision,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    });
  }

  return budgets;
}

export async function updateExpenseBudget(
  client: PoolClient,
  workspaceId: string,
  budgetId: string,
  input: UpdateExpenseBudgetBody,
  operationId?: string
): Promise<ExpenseBudget & { seq?: number }> {
  const existing = await client.query<{
    id: string;
    currency: string;
    period: string;
    category_id: string | null;
    amount_minor_units: string;
    revision: number;
  }>(
    `SELECT id, currency, period, category_id, amount_minor_units, revision
     FROM app.expense_budgets
     WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL;`,
    [workspaceId, budgetId]
  );
  if (existing.rows.length === 0) {
    throw new NotFoundError(`Budget ${budgetId} not found`);
  }

  const cur = existing.rows[0]!;
  const newAmount = parseDecimalToMinorUnits(input.amount, cur.currency);

  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  const res = await client.query<{
    id: string;
    workspace_id: string;
    period: string;
    currency: string;
    category_id: string | null;
    amount_minor_units: string;
    revision: number;
    created_at: Date;
    updated_at: Date;
  }>(
    `UPDATE app.expense_budgets
     SET amount_minor_units = $1, revision = revision + 1, updated_at = now()
     WHERE workspace_id = $2 AND id = $3 AND deleted_at IS NULL
     RETURNING id, workspace_id, period, currency, category_id, amount_minor_units, revision, created_at, updated_at;`,
    [newAmount.toString(), workspaceId, budgetId]
  );

  const row = res.rows[0]!;
  const seq = syncState.nextChangeSeq;

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'expense_budget',
    entityId: budgetId,
    revision: row.revision,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      amountMinorUnits: row.amount_minor_units,
    },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    period: row.period,
    currency: row.currency,
    categoryId: row.category_id,
    amountMinorUnits: row.amount_minor_units,
    amountFormatted: formatMinorUnitsToDecimal(BigInt(row.amount_minor_units), row.currency),
    revision: row.revision,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    seq,
  };
}

export async function deleteExpenseBudget(
  client: PoolClient,
  workspaceId: string,
  budgetId: string,
  operationId?: string
): Promise<{ success: boolean; id: string; seq?: number }> {
  const existing = await client.query<{ id: string; revision: number }>(
    `SELECT id, revision FROM app.expense_budgets
     WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL;`,
    [workspaceId, budgetId]
  );
  if (existing.rows.length === 0) {
    throw new NotFoundError(`Budget ${budgetId} not found`);
  }

  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  const res = await client.query<{ revision: number }>(
    `UPDATE app.expense_budgets
     SET deleted_at = now(), revision = revision + 1, updated_at = now()
     WHERE workspace_id = $1 AND id = $2
     RETURNING revision;`,
    [workspaceId, budgetId]
  );

  const finalRev = res.rows[0]?.revision ?? 2;
  const seq = syncState.nextChangeSeq;

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'expense_budget',
    entityId: budgetId,
    revision: finalRev,
    isTombstone: true,
    operationId: operationId || crypto.randomUUID(),
    changeData: { deleted: true },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return { success: true, id: budgetId, seq };
}

// -----------------------------------------------------------------------------
// CSV Export (Phase 40)
// -----------------------------------------------------------------------------

/**
 * Escapes a value for RFC 4180 CSV compliance and neutralizes formula injection
 * (OWASP CSV Injection defense: cells starting with =, +, -, @, \t, \r are prepended with ').
 */
export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  let str = String(val);

  // Neutralize formula injection
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // RFC 4180 escaping
  if (/[",\r\n]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export async function exportExpensesCsv(
  client: PoolClient,
  workspaceId: string,
  filter?: {
    startDate?: string;
    endDate?: string;
    categoryId?: string;
    currency?: string;
    kind?: 'expense' | 'income' | 'refund';
  }
): Promise<string> {
  const whereClauses = [
    'e.workspace_id = $1',
    'i.deleted_at IS NULL',
    "i.security_scope != 'vault'",
  ];
  const params: unknown[] = [workspaceId];
  let paramIdx = 2;

  if (filter?.startDate) {
    whereClauses.push(`e.transaction_date >= $${paramIdx++}`);
    params.push(filter.startDate);
  }
  if (filter?.endDate) {
    whereClauses.push(`e.transaction_date <= $${paramIdx++}`);
    params.push(filter.endDate);
  }
  if (filter?.categoryId) {
    whereClauses.push(`e.category_id = $${paramIdx++}`);
    params.push(filter.categoryId);
  }
  if (filter?.currency) {
    whereClauses.push(`e.currency = $${paramIdx++}`);
    params.push(filter.currency);
  }
  if (filter?.kind) {
    whereClauses.push(`e.kind = $${paramIdx++}`);
    params.push(filter.kind);
  }

  const res = await client.query<{
    id: string;
    transaction_date: string;
    kind: string;
    amount_minor_units: string;
    currency: string;
    category_name: string | null;
    payment_label: string | null;
    note: string | null;
    receipt_file_id: string | null;
    original_expense_id: string | null;
    created_at: Date;
  }>(
    `SELECT e.id, e.transaction_date::text as transaction_date, e.kind,
            e.amount_minor_units::text as amount_minor_units, e.currency,
            c.name as category_name, e.payment_label, e.note,
            e.receipt_file_id, e.original_expense_id, e.created_at
     FROM app.expense_items e
     JOIN app.items i ON i.id = e.id AND i.workspace_id = e.workspace_id
     LEFT JOIN app.expense_categories c ON c.id = e.category_id AND c.workspace_id = e.workspace_id
     WHERE ${whereClauses.join(' AND ')}
     ORDER BY e.transaction_date DESC, e.id DESC;`,
    params
  );

  const header = [
    'Date',
    'Kind',
    'Amount',
    'Currency',
    'Category',
    'Payment Label',
    'Note',
    'Receipt ID',
    'Original Expense ID',
    'ID',
  ].join(',');

  const rows = res.rows.map((r) => {
    const formattedAmount = formatMinorUnitsToDecimal(BigInt(r.amount_minor_units), r.currency);
    return [
      escapeCsvCell(r.transaction_date),
      escapeCsvCell(r.kind),
      escapeCsvCell(formattedAmount),
      escapeCsvCell(r.currency),
      escapeCsvCell(r.category_name || ''),
      escapeCsvCell(r.payment_label || ''),
      escapeCsvCell(r.note || ''),
      escapeCsvCell(r.receipt_file_id || ''),
      escapeCsvCell(r.original_expense_id || ''),
      escapeCsvCell(r.id),
    ].join(',');
  });

  const BOM = '\uFEFF';
  return BOM + [header, ...rows].join('\r\n') + '\r\n';
}

