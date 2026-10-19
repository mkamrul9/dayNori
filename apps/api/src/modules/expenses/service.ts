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
} from '@daynori/contracts';
import {
  getCurrencyInfo,
  parseDecimalToMinorUnits,
  formatMinorUnitsToDecimal,
  validateRefundBounds,
  calculateNetSpending,
  calculateNetSavings,
  getNextOccurrenceDate,
} from '@daynori/domain';
import {
  lockWorkspaceSyncState,
  insertChange,
  updateWorkspaceSyncSeq,
} from '../sync/repository.js';
import { NotFoundError, ValidationError } from '../../plugins/errorHandler.js';

interface ExpenseItemDbRow {
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

function mapRowToExpenseItem(r: ExpenseItemDbRow): ExpenseItem {
  const minorUnits = BigInt(r.amount_minor_units);
  const cumulativeRefund = BigInt(r.cumulative_refund_minor_units || '0');

  return {
    id: r.id,
    workspaceId: r.workspace_id,
    kind: r.kind,
    amountMinorUnits: minorUnits.toString(),
    amountFormatted: formatMinorUnitsToDecimal(minorUnits, r.currency),
    currency: r.currency,
    transactionDate: formatDateOnly(r.transaction_date),
    occurredAt: r.occurred_at ? r.occurred_at.toISOString() : null,
    timezone: r.timezone,
    categoryId: r.category_id,
    categoryName: r.category_name ?? null,
    paymentLabel: r.payment_label,
    note: r.note,
    receiptFileId: r.receipt_file_id,
    originalExpenseId: r.original_expense_id,
    cumulativeRefundMinorUnits: cumulativeRefund.toString(),
    folderId: r.folder_id,
    deletedAt: r.deleted_at ? r.deleted_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

// -----------------------------------------------------------------------------
// Category Service
// -----------------------------------------------------------------------------

export async function createExpenseCategory(
  client: PoolClient | Pool,
  workspaceId: string,
  input: CreateExpenseCategoryBody
): Promise<ExpenseCategory> {
  const name = input.name.trim();
  if (!name) {
    throw new ValidationError('Category name cannot be empty');
  }

  // Check duplicate name within workspace
  const dup = await client.query<{ id: string }>(
    `SELECT id FROM app.expense_categories
     WHERE workspace_id = $1 AND lower(trim(name)) = lower($2) AND deleted_at IS NULL;`,
    [workspaceId, name]
  );
  if (dup.rows.length > 0) {
    throw new ValidationError(`Category with name '${name}' already exists in this workspace`);
  }

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
    [workspaceId, name, input.color || null, input.icon || null, input.displayOrder || 0]
  );

  const row = res.rows[0]!;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    displayOrder: row.display_order,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
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
  client: PoolClient | Pool,
  workspaceId: string,
  categoryId: string,
  input: UpdateExpenseCategoryBody
): Promise<ExpenseCategory> {
  const catRes = await client.query<{ id: string; name: string }>(
    `SELECT id, name FROM app.expense_categories
     WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL;`,
    [workspaceId, categoryId]
  );
  if (catRes.rows.length === 0) {
    throw new NotFoundError('Expense category not found');
  }

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) throw new ValidationError('Category name cannot be empty');

    const dup = await client.query<{ id: string }>(
      `SELECT id FROM app.expense_categories
       WHERE workspace_id = $1 AND lower(trim(name)) = lower($2) AND id != $3 AND deleted_at IS NULL;`,
      [workspaceId, trimmed, categoryId]
    );
    if (dup.rows.length > 0) {
      throw new ValidationError(`Category with name '${trimmed}' already exists`);
    }
  }

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
         color = CASE WHEN $2::text IS NOT NULL THEN $2 ELSE color END,
         icon = CASE WHEN $3::text IS NOT NULL THEN $3 ELSE icon END,
         display_order = COALESCE($4, display_order),
         updated_at = now()
     WHERE workspace_id = $5 AND id = $6 AND deleted_at IS NULL
     RETURNING id, workspace_id, name, color, icon, display_order, created_at, updated_at;`,
    [
      input.name ? input.name.trim() : null,
      input.color !== undefined ? input.color : null,
      input.icon !== undefined ? input.icon : null,
      input.displayOrder !== undefined ? input.displayOrder : null,
      workspaceId,
      categoryId,
    ]
  );

  const row = res.rows[0]!;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    displayOrder: row.display_order,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function deleteExpenseCategory(
  client: PoolClient | Pool,
  workspaceId: string,
  categoryId: string
): Promise<{ success: boolean; id: string }> {
  const res = await client.query(
    `UPDATE app.expense_categories
     SET deleted_at = now(), updated_at = now()
     WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL;`,
    [workspaceId, categoryId]
  );
  if ((res.rowCount ?? 0) === 0) {
    throw new NotFoundError('Expense category not found or already deleted');
  }
  return { success: true, id: categoryId };
}

// -----------------------------------------------------------------------------
// Expense Records Service
// -----------------------------------------------------------------------------

export async function createExpenseRecord(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  input: CreateExpenseBody,
  operationId?: string
): Promise<ExpenseItem & { seq: number }> {
  const currencyInfo = getCurrencyInfo(input.currency);
  const amountMinorUnits = parseDecimalToMinorUnits(input.amount, currencyInfo.code);
  const entryId = crypto.randomUUID();
  const kind = input.kind || 'expense';

  // 1. Validate folder if provided
  if (input.folderId) {
    const fRes = await client.query<{ id: string }>(
      `SELECT id FROM app.items
       WHERE workspace_id = $1 AND id = $2 AND kind = 'folder' AND deleted_at IS NULL;`,
      [workspaceId, input.folderId]
    );
    if (fRes.rows.length === 0) {
      throw new ValidationError(
        `Target folder ${input.folderId} does not exist or has been deleted.`
      );
    }
  }

  // 2. Validate category if provided
  let categoryId = input.categoryId || null;
  if (categoryId) {
    const cRes = await client.query<{ id: string }>(
      `SELECT id FROM app.expense_categories
       WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL;`,
      [workspaceId, categoryId]
    );
    if (cRes.rows.length === 0) {
      throw new ValidationError(
        `Expense category ${categoryId} does not exist or has been deleted.`
      );
    }
  }

  // 3. Validate receipt file reference if provided (must be in same workspace, active, verified)
  if (input.receiptFileId) {
    const fileRes = await client.query<{ id: string; quarantine_status: string }>(
      `SELECT f.id, f.quarantine_status
       FROM app.file_items f
       JOIN app.items i ON i.id = f.id
       WHERE f.workspace_id = $1 AND f.id = $2 AND i.deleted_at IS NULL;`,
      [workspaceId, input.receiptFileId]
    );
    if (fileRes.rows.length === 0) {
      throw new ValidationError(
        `Receipt file ${input.receiptFileId} does not exist or has been deleted.`
      );
    }
    if (fileRes.rows[0]!.quarantine_status !== 'verified') {
      throw new ValidationError(
        `Receipt file ${input.receiptFileId} is not verified (status: ${fileRes.rows[0]!.quarantine_status}); quarantined files cannot be attached.`
      );
    }
  }

  // 4. Handle refund invariants under transactional row lock
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

    // Automatically inherit original category if not specified
    if (!categoryId && orig.category_id) {
      categoryId = orig.category_id;
    }
  } else {
    // Non-refund records must not have originalExpenseId
    originalExpenseId = null;
  }

  // 5. Acquire workspace sync lock
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  // 6. Insert into app.items
  await client.query(
    `INSERT INTO app.items (
      id, workspace_id, folder_id, kind, created_by, updated_by,
      revision, rank, is_archived, is_pinned, security_scope
    ) VALUES ($1, $2, $3, 'expense', $4, $4, 1, '00001000', false, false, 'standard');`,
    [entryId, workspaceId, input.folderId || null, actorUserId]
  );

  // 7. Insert into app.expense_items
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

  // Fetch category name if attached
  if (categoryId) {
    const cNameRes = await client.query<{ name: string }>(
      `SELECT name FROM app.expense_categories WHERE id = $1;`,
      [categoryId]
    );
    row.category_name = cNameRes.rows[0]?.name ?? null;
  }

  const seq = syncState.nextChangeSeq;

  // 8. Record change feed entry
  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'item',
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

  const mapped = mapRowToExpenseItem(row);
  return { ...mapped, seq };
}

export async function getExpenseRecord(
  client: PoolClient | Pool,
  workspaceId: string,
  expenseId: string
): Promise<ExpenseItem> {
  const res = await client.query<ExpenseItemDbRow>(
    `SELECT e.*, i.folder_id, i.deleted_at, c.name as category_name
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
): Promise<ExpenseItem[]> {
  const conditions: string[] = ['e.workspace_id = $1', 'i.deleted_at IS NULL'];
  const params: unknown[] = [workspaceId];
  let pIdx = 2;

  if (query.year) {
    if (query.month) {
      const monthStr = String(query.month).padStart(2, '0');
      const start = `${query.year}-${monthStr}-01`;
      // Safe next month calculation
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

  const limit = Math.min(query.limit || 50, 200);

  const res = await client.query<ExpenseItemDbRow>(
    `SELECT e.*, i.folder_id, i.deleted_at, c.name as category_name
     FROM app.expense_items e
     JOIN app.items i ON i.id = e.id AND i.workspace_id = e.workspace_id
     LEFT JOIN app.expense_categories c ON c.id = e.category_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY e.transaction_date DESC, e.created_at DESC
     LIMIT $${pIdx};`,
    [...params, limit]
  );

  return res.rows.map(mapRowToExpenseItem);
}

export async function updateExpenseRecord(
  client: PoolClient,
  workspaceId: string,
  expenseId: string,
  actorUserId: string,
  input: UpdateExpenseBody,
  operationId?: string
): Promise<ExpenseItem & { seq: number }> {
  // Lock current expense row
  const curRes = await client.query<{
    id: string;
    kind: string;
    amount_minor_units: string;
    currency: string;
    original_expense_id: string | null;
    cumulative_refund_minor_units: string;
    deleted_at: Date | null;
  }>(
    `SELECT e.id, e.kind, e.amount_minor_units, e.currency, e.original_expense_id,
            e.cumulative_refund_minor_units, i.deleted_at
     FROM app.expense_items e
     JOIN app.items i ON i.id = e.id
     WHERE e.workspace_id = $1 AND e.id = $2
     FOR UPDATE OF e;`,
    [workspaceId, expenseId]
  );

  if (curRes.rows.length === 0) {
    throw new NotFoundError(`Expense record ${expenseId} not found`);
  }

  const current = curRes.rows[0]!;
  if (current.deleted_at) {
    throw new ValidationError('Cannot update a deleted expense record');
  }

  let newCurrency = current.currency;
  if (input.currency) {
    const cInfo = getCurrencyInfo(input.currency);
    newCurrency = cInfo.code;
    if (newCurrency !== current.currency) {
      // Currency changes are forbidden if active refunds exist or if this record is a refund
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
      // Re-validate against original expense
      const origRes = await client.query<{ amount_minor_units: string }>(
        `SELECT amount_minor_units FROM app.expense_items
         WHERE workspace_id = $1 AND id = $2
         FOR UPDATE;`,
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

      // Update original expense cumulative_refund_minor_units
      await client.query(
        `UPDATE app.expense_items
         SET cumulative_refund_minor_units = $1, updated_at = now()
         WHERE workspace_id = $2 AND id = $3;`,
        [(otherRefunds + newAmountMinorUnits).toString(), workspaceId, current.original_expense_id]
      );
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
      throw new ValidationError(`Expense category ${input.categoryId} does not exist`);
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

  // Validate folder if updating
  if (input.folderId !== undefined && input.folderId !== null) {
    const fRes = await client.query<{ id: string }>(
      `SELECT id FROM app.items
       WHERE workspace_id = $1 AND id = $2 AND kind = 'folder' AND deleted_at IS NULL;`,
      [workspaceId, input.folderId]
    );
    if (fRes.rows.length === 0) {
      throw new ValidationError(`Folder ${input.folderId} does not exist`);
    }
    await client.query(
      `UPDATE app.items SET folder_id = $1, updated_by = $2, updated_at = now() WHERE id = $3;`,
      [input.folderId, actorUserId, expenseId]
    );
  }

  // Update app.expense_items
  const occurredAt =
    input.occurredAt !== undefined
      ? input.occurredAt
        ? new Date(input.occurredAt)
        : null
      : undefined;

  const res = await client.query<ExpenseItemDbRow>(
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
     WHERE workspace_id = $15 AND id = $16
     RETURNING *;`,
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

  const row = res.rows[0]!;

  // Sync state & change feed
  const syncState = await lockWorkspaceSyncState(client, workspaceId);
  const seq = syncState.nextChangeSeq;

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'item',
    entityId: expenseId,
    revision: 2,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      kind: 'expense',
      action: 'updated',
      amountMinorUnits: newAmountMinorUnits.toString(),
      currency: newCurrency,
      transactionDate: row.transaction_date,
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
): Promise<{ success: boolean; id: string; seq: number }> {
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

  if (expRes.rows.length === 0) {
    throw new NotFoundError(`Expense record ${expenseId} not found`);
  }

  const exp = expRes.rows[0]!;
  if (exp.deleted_at) {
    return { success: true, id: expenseId, seq: 0 };
  }

  // Invariant: Cannot trash an original expense while active refunds reference it!
  if (exp.kind === 'expense') {
    const activeRefunds = BigInt(exp.cumulative_refund_minor_units || '0');
    if (activeRefunds > 0n) {
      throw new ValidationError(
        'Cannot delete expense with active refund references. Revert or trash active refunds first.'
      );
    }
  }

  // If trashing a refund, atomically decrement cumulative_refund_minor_units on original expense
  if (exp.kind === 'refund' && exp.original_expense_id) {
    const refundAmount = BigInt(exp.amount_minor_units);
    await client.query(
      `UPDATE app.expense_items
       SET cumulative_refund_minor_units = GREATEST(0, cumulative_refund_minor_units - $1),
           updated_at = now()
       WHERE workspace_id = $2 AND id = $3;`,
      [refundAmount.toString(), workspaceId, exp.original_expense_id]
    );
  }

  // Soft delete in app.items
  await client.query(
    `UPDATE app.items SET deleted_at = now(), updated_by = $1 WHERE workspace_id = $2 AND id = $3;`,
    [actorUserId, workspaceId, expenseId]
  );

  // Sync state & change feed
  const syncState = await lockWorkspaceSyncState(client, workspaceId);
  const seq = syncState.nextChangeSeq;

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'item',
    entityId: expenseId,
    revision: 2,
    isTombstone: true,
    operationId: operationId || crypto.randomUUID(),
    changeData: { kind: 'expense', action: 'trashed' },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return { success: true, id: expenseId, seq };
}

export async function restoreExpenseRecord(
  client: PoolClient,
  workspaceId: string,
  expenseId: string,
  actorUserId: string,
  operationId?: string
): Promise<{ success: boolean; id: string; seq: number }> {
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

  if (expRes.rows.length === 0) {
    throw new NotFoundError(`Expense record ${expenseId} not found`);
  }

  const exp = expRes.rows[0]!;
  if (!exp.deleted_at) {
    return { success: true, id: expenseId, seq: 0 };
  }

  // If restoring a refund, verify original expense exists and restoring won't exceed bounds
  if (exp.kind === 'refund' && exp.original_expense_id) {
    const origRes = await client.query<{
      amount_minor_units: string;
      deleted_at: Date | null;
    }>(
      `SELECT e.amount_minor_units, i.deleted_at
       FROM app.expense_items e
       JOIN app.items i ON i.id = e.id
       WHERE e.workspace_id = $1 AND e.id = $2
       FOR UPDATE OF e;`,
      [workspaceId, exp.original_expense_id]
    );

    if (origRes.rows.length === 0 || origRes.rows[0]!.deleted_at) {
      throw new ValidationError('Cannot restore refund because original expense is deleted');
    }

    const origAmount = BigInt(origRes.rows[0]!.amount_minor_units);
    const sumRes = await client.query<{ sum: string | null }>(
      `SELECT SUM(e.amount_minor_units) as sum
       FROM app.expense_items e
       JOIN app.items i ON i.id = e.id
       WHERE e.workspace_id = $1 AND e.original_expense_id = $2 AND i.deleted_at IS NULL;`,
      [workspaceId, exp.original_expense_id]
    );
    const currentActiveRefunds = BigInt(sumRes.rows[0]?.sum || '0');
    const restoreAmount = BigInt(exp.amount_minor_units);

    validateRefundBounds(origAmount, currentActiveRefunds, restoreAmount);

    // Atomically increment cumulative refunds
    await client.query(
      `UPDATE app.expense_items
       SET cumulative_refund_minor_units = $1, updated_at = now()
       WHERE workspace_id = $2 AND id = $3;`,
      [(currentActiveRefunds + restoreAmount).toString(), workspaceId, exp.original_expense_id]
    );
  }

  // Restore in app.items
  await client.query(
    `UPDATE app.items SET deleted_at = NULL, updated_by = $1 WHERE workspace_id = $2 AND id = $3;`,
    [actorUserId, workspaceId, expenseId]
  );

  // Sync state & change feed
  const syncState = await lockWorkspaceSyncState(client, workspaceId);
  const seq = syncState.nextChangeSeq;

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'item',
    entityId: expenseId,
    revision: 3,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: { kind: 'expense', action: 'restored' },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return { success: true, id: expenseId, seq };
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
  const itemsRes = await client.query<{
    kind: 'expense' | 'income' | 'refund';
    amount_minor_units: string;
    currency: string;
    category_id: string | null;
    category_name: string | null;
    category_color: string | null;
  }>(
    `SELECT e.kind, e.amount_minor_units, e.currency, e.category_id,
            c.name as category_name, c.color as category_color
     FROM app.expense_items e
     JOIN app.items i ON i.id = e.id AND i.workspace_id = e.workspace_id
     LEFT JOIN app.expense_categories c ON c.id = e.category_id
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
      // Refund reduces category spending
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
// Recurring Templates Service
// -----------------------------------------------------------------------------

export async function createExpenseRecurringTemplate(
  client: PoolClient | Pool,
  workspaceId: string,
  input: CreateExpenseRecurringTemplateBody
): Promise<ExpenseRecurringTemplate> {
  const currencyInfo = getCurrencyInfo(input.currency);
  const amountMinorUnits = parseDecimalToMinorUnits(input.amount, currencyInfo.code);

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
      input.categoryId || null,
      input.paymentLabel || null,
      input.note || null,
      JSON.stringify(input.schedule),
      input.timezone || 'UTC',
      input.startDate,
      input.endDate || null,
      input.isActive !== undefined ? input.isActive : true,
    ]
  );

  const r = res.rows[0]!;
  const minor = BigInt(r.amount_minor_units);

  return {
    id: r.id,
    workspaceId: r.workspace_id,
    title: r.title,
    kind: r.kind,
    amountMinorUnits: minor.toString(),
    amountFormatted: formatMinorUnitsToDecimal(minor, r.currency),
    currency: r.currency,
    categoryId: r.category_id,
    paymentLabel: r.payment_label,
    note: r.note,
    schedule: typeof r.schedule === 'string' ? JSON.parse(r.schedule) : r.schedule,
    timezone: r.timezone,
    startDate: formatDateOnly(r.start_date),
    endDate: r.end_date ? formatDateOnly(r.end_date) : null,
    isActive: Boolean(r.is_active),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
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

  return res.rows.map((r) => {
    const minor = BigInt(r.amount_minor_units);
    return {
      id: r.id,
      workspaceId: r.workspace_id,
      title: r.title,
      kind: r.kind,
      amountMinorUnits: minor.toString(),
      amountFormatted: formatMinorUnitsToDecimal(minor, r.currency),
      currency: r.currency,
      categoryId: r.category_id,
      paymentLabel: r.payment_label,
      note: r.note,
      schedule: typeof r.schedule === 'string' ? JSON.parse(r.schedule) : r.schedule,
      timezone: r.timezone,
      startDate: formatDateOnly(r.start_date),
      endDate: r.end_date ? formatDateOnly(r.end_date) : null,
      isActive: Boolean(r.is_active),
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    };
  });
}

/**
 * Generates pending recurring occurrences up to target date with deduplication.
 */
export async function generateRecurringOccurrences(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  untilDateStr: string
): Promise<{ generatedCount: number; expenseIds: string[] }> {
  const templates = await listExpenseRecurringTemplates(client, workspaceId);
  const expenseIds: string[] = [];

  for (const t of templates) {
    if (!t.isActive) continue;

    let nextDate: string | null = t.startDate;
    while (nextDate && nextDate <= untilDateStr) {
      // Check deduplication table
      const occRes = await client.query<{ occurrence_date: string }>(
        `SELECT occurrence_date FROM app.expense_recurring_occurrences
         WHERE template_id = $1 AND occurrence_date = $2;`,
        [t.id, nextDate]
      );

      if (occRes.rows.length === 0) {
        // Create generated expense
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

        // Record deduplicated occurrence
        await client.query(
          `INSERT INTO app.expense_recurring_occurrences (template_id, occurrence_date, expense_id)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING;`,
          [t.id, nextDate, created.id]
        );

        expenseIds.push(created.id);
      }

      nextDate = getNextOccurrenceDate(t.schedule, t.startDate, nextDate, t.endDate || undefined);
    }
  }

  return { generatedCount: expenseIds.length, expenseIds };
}
