import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';

// -----------------------------------------------------------------------------
// Semantic & Calendar Validation Helpers
// -----------------------------------------------------------------------------

export function isValidCalendarDate(dateStr: string): boolean {
  if (typeof dateStr !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return false;
  const year = parseInt(match[1]!, 10);
  const month = parseInt(match[2]!, 10);
  const day = parseInt(match[3]!, 10);
  if (year < 1900 || year > 2200) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

export function isValidIanaTimezone(tz: string): boolean {
  if (typeof tz !== 'string' || !tz.trim()) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

export const CalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD')
  .refine(isValidCalendarDate, { message: 'Date must be a real calendar date' });

export const IanaTimezoneSchema = z
  .string()
  .trim()
  .refine(isValidIanaTimezone, { message: 'Invalid IANA timezone' });

/**
 * Strict exact decimal string money schema.
 * Rejects JavaScript Numbers to prevent floating-point inaccuracy and precision loss.
 */
export const ExactMoneyStringSchema = z
  .string()
  .trim()
  .min(1, 'Amount cannot be empty')
  .regex(/^\d+(\.\d+)?$/, 'Amount must be an exact non-negative decimal string (e.g. "12.50" or "100")');

// -----------------------------------------------------------------------------
// Expense Categories
// -----------------------------------------------------------------------------

export const ExpenseCategorySchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(100),
  color: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  displayOrder: z.number().int().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ExpenseCategory = z.infer<typeof ExpenseCategorySchema>;

export const CreateExpenseCategoryBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  color: z.string().trim().max(50).optional().nullable(),
  icon: z.string().trim().max(50).optional().nullable(),
  displayOrder: z.number().int().optional(),
});
export type CreateExpenseCategoryBody = z.infer<typeof CreateExpenseCategoryBodySchema>;

export const UpdateExpenseCategoryBodySchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  color: z.string().trim().max(50).optional().nullable(),
  icon: z.string().trim().max(50).optional().nullable(),
  displayOrder: z.number().int().optional(),
});
export type UpdateExpenseCategoryBody = z.infer<typeof UpdateExpenseCategoryBodySchema>;

export const ExpenseCategoryResponseSchema = z.object({
  data: ExpenseCategorySchema,
  meta: ResponseMetaSchema,
});
export type ExpenseCategoryResponse = z.infer<typeof ExpenseCategoryResponseSchema>;

export const ExpenseCategoryListResponseSchema = z.object({
  data: z.array(ExpenseCategorySchema),
  meta: ResponseMetaSchema,
});
export type ExpenseCategoryListResponse = z.infer<typeof ExpenseCategoryListResponseSchema>;

// -----------------------------------------------------------------------------
// Expense Items
// -----------------------------------------------------------------------------

export const ExpenseKindSchema = z.enum(['expense', 'income', 'refund']);
export type ExpenseKind = z.infer<typeof ExpenseKindSchema>;

export const ExpenseItemSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  kind: ExpenseKindSchema,
  amountMinorUnits: z.string(), // Serialized BigInt integer string
  amountFormatted: z.string(), // Decimal string e.g. "12.50"
  currency: z.string().min(3).max(3),
  transactionDate: CalendarDateSchema,
  occurredAt: z.string().datetime().nullable().optional(),
  timezone: z.string().default('UTC'),
  categoryId: z.string().uuid().nullable().optional(),
  categoryName: z.string().nullable().optional(),
  paymentLabel: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  receiptFileId: z.string().uuid().nullable().optional(),
  originalExpenseId: z.string().uuid().nullable().optional(),
  cumulativeRefundMinorUnits: z.string().default('0'),
  folderId: z.string().uuid().nullable().optional(),
  revision: z.coerce.number().int().default(1),
  deletedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ExpenseItem = z.infer<typeof ExpenseItemSchema>;

export const CreateExpenseBodySchema = z.object({
  kind: ExpenseKindSchema.default('expense'),
  amount: ExactMoneyStringSchema,
  currency: z.string().trim().min(3).max(3),
  transactionDate: CalendarDateSchema,
  occurredAt: z.string().datetime().optional().nullable(),
  timezone: IanaTimezoneSchema.default('UTC').optional(),
  categoryId: z.string().uuid().optional().nullable(),
  paymentLabel: z.string().trim().max(100).optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
  receiptFileId: z.string().uuid().optional().nullable(),
  originalExpenseId: z.string().uuid().optional().nullable(),
  folderId: z.string().uuid().optional().nullable(),
});
export type CreateExpenseBody = z.infer<typeof CreateExpenseBodySchema>;

export const UpdateExpenseBodySchema = z.object({
  baseRevision: z.number().int().nonnegative().optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
  amount: ExactMoneyStringSchema.optional(),
  currency: z.string().trim().min(3).max(3).optional(),
  transactionDate: CalendarDateSchema.optional(),
  occurredAt: z.string().datetime().optional().nullable(),
  timezone: IanaTimezoneSchema.optional(),
  categoryId: z.string().uuid().optional().nullable(),
  paymentLabel: z.string().trim().max(100).optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
  receiptFileId: z.string().uuid().optional().nullable(),
  folderId: z.string().uuid().optional().nullable(),
});
export type UpdateExpenseBody = z.infer<typeof UpdateExpenseBodySchema>;

export const ExpenseResponseSchema = z.object({
  data: ExpenseItemSchema,
  meta: ResponseMetaSchema,
});
export type ExpenseResponse = z.infer<typeof ExpenseResponseSchema>;

export const ExpenseListQuerySchema = z.object({
  year: z.coerce.number().int().min(1900).max(2200).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  startDate: CalendarDateSchema.optional(),
  endDate: CalendarDateSchema.optional(),
  kind: ExpenseKindSchema.optional(),
  categoryId: z.string().uuid().optional(),
  currency: z.string().min(3).max(3).optional(),
  folderId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50).optional(),
  cursor: z.string().optional(),
});
export type ExpenseListQuery = z.infer<typeof ExpenseListQuerySchema>;

export const ExpensePaginationMetaSchema = z.object({
  nextCursor: z.string().nullable().optional(),
  hasMore: z.boolean().default(false),
});
export type ExpensePaginationMeta = z.infer<typeof ExpensePaginationMetaSchema>;

export const ExpenseListResponseSchema = z.object({
  data: z.array(ExpenseItemSchema),
  meta: ResponseMetaSchema.extend({
    pagination: ExpensePaginationMetaSchema.optional(),
  }),
});
export type ExpenseListResponse = z.infer<typeof ExpenseListResponseSchema>;

// -----------------------------------------------------------------------------
// Expense Summaries & Aggregations (Per Currency)
// -----------------------------------------------------------------------------

export const CategoryBreakdownSchema = z.object({
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string(),
  categoryColor: z.string().nullable().optional(),
  spentMinorUnits: z.string(), // May be negative if refunds exceed expenses in period
  spentFormatted: z.string(),
  transactionCount: z.number().int(),
});
export type CategoryBreakdown = z.infer<typeof CategoryBreakdownSchema>;

export const CurrencyMonthlySummarySchema = z.object({
  currency: z.string(),
  totalIncomeMinorUnits: z.string(),
  totalIncomeFormatted: z.string(),
  grossExpenseMinorUnits: z.string(),
  grossExpenseFormatted: z.string(),
  totalRefundMinorUnits: z.string(),
  totalRefundFormatted: z.string(),
  netExpenseMinorUnits: z.string(),
  netExpenseFormatted: z.string(),
  netSavingsMinorUnits: z.string(),
  netSavingsFormatted: z.string(),
  categoryBreakdown: z.array(CategoryBreakdownSchema),
  transactionCount: z.number().int(),
});
export type CurrencyMonthlySummary = z.infer<typeof CurrencyMonthlySummarySchema>;

export const ExpenseMonthlySummaryResponseSchema = z.object({
  data: z.array(CurrencyMonthlySummarySchema),
  meta: ResponseMetaSchema,
});
export type ExpenseMonthlySummaryResponse = z.infer<typeof ExpenseMonthlySummaryResponseSchema>;

// -----------------------------------------------------------------------------
// Recurring Entry Templates
// -----------------------------------------------------------------------------

export const RecurringScheduleSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().int().min(1).default(1).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
});
export type RecurringSchedule = z.infer<typeof RecurringScheduleSchema>;

export const ExpenseRecurringTemplateSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  title: z.string().min(1).max(200),
  kind: z.enum(['expense', 'income']),
  amountMinorUnits: z.string(),
  amountFormatted: z.string(),
  currency: z.string().min(3).max(3),
  categoryId: z.string().uuid().nullable().optional(),
  paymentLabel: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  schedule: RecurringScheduleSchema,
  timezone: z.string().default('UTC'),
  startDate: CalendarDateSchema,
  endDate: CalendarDateSchema.nullable().optional(),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ExpenseRecurringTemplate = z.infer<typeof ExpenseRecurringTemplateSchema>;

export const CreateExpenseRecurringTemplateBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(['expense', 'income']),
  amount: ExactMoneyStringSchema,
  currency: z.string().trim().min(3).max(3),
  categoryId: z.string().uuid().optional().nullable(),
  paymentLabel: z.string().trim().max(100).optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
  schedule: RecurringScheduleSchema,
  timezone: IanaTimezoneSchema.default('UTC').optional(),
  startDate: CalendarDateSchema,
  endDate: CalendarDateSchema.optional().nullable(),
  isActive: z.boolean().default(true).optional(),
});
export type CreateExpenseRecurringTemplateBody = z.infer<
  typeof CreateExpenseRecurringTemplateBodySchema
>;

export const ExpenseRecurringTemplateResponseSchema = z.object({
  data: ExpenseRecurringTemplateSchema,
  meta: ResponseMetaSchema,
});
export type ExpenseRecurringTemplateResponse = z.infer<
  typeof ExpenseRecurringTemplateResponseSchema
>;

export const ExpenseRecurringTemplateListResponseSchema = z.object({
  data: z.array(ExpenseRecurringTemplateSchema),
  meta: ResponseMetaSchema,
});
export type ExpenseRecurringTemplateListResponse = z.infer<
  typeof ExpenseRecurringTemplateListResponseSchema
>;

export const GenerateOccurrencesBodySchema = z.object({
  untilDate: CalendarDateSchema,
});
export type GenerateOccurrencesBody = z.infer<typeof GenerateOccurrencesBodySchema>;

// -----------------------------------------------------------------------------
// Budgets (Phase 40)
// -----------------------------------------------------------------------------

export const ExpenseBudgetSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  currency: z.string().min(3).max(3),
  categoryId: z.string().uuid().nullable().optional(),
  categoryName: z.string().nullable().optional(),
  amountMinorUnits: z.string(),
  amountFormatted: z.string(),
  spentMinorUnits: z.string().optional(),
  spentFormatted: z.string().optional(),
  remainingMinorUnits: z.string().optional(),
  remainingFormatted: z.string().optional(),
  revision: z.number().int().default(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ExpenseBudget = z.infer<typeof ExpenseBudgetSchema>;

export const CreateExpenseBudgetBodySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be in YYYY-MM format'),
  currency: z.string().trim().min(3).max(3),
  categoryId: z.string().uuid().optional().nullable(),
  amount: ExactMoneyStringSchema,
});
export type CreateExpenseBudgetBody = z.infer<typeof CreateExpenseBudgetBodySchema>;

export const UpdateExpenseBudgetBodySchema = z.object({
  amount: ExactMoneyStringSchema,
});
export type UpdateExpenseBudgetBody = z.infer<typeof UpdateExpenseBudgetBodySchema>;

export const ExpenseBudgetResponseSchema = z.object({
  data: ExpenseBudgetSchema,
  meta: ResponseMetaSchema,
});
export type ExpenseBudgetResponse = z.infer<typeof ExpenseBudgetResponseSchema>;

export const ExpenseBudgetListResponseSchema = z.object({
  data: z.array(ExpenseBudgetSchema),
  meta: ResponseMetaSchema,
});
export type ExpenseBudgetListResponse = z.infer<typeof ExpenseBudgetListResponseSchema>;

// -----------------------------------------------------------------------------
// CSV Export Query (Phase 40)
// -----------------------------------------------------------------------------

export const ExpenseExportQuerySchema = z.object({
  startDate: CalendarDateSchema.optional(),
  endDate: CalendarDateSchema.optional(),
  categoryId: z.string().uuid().optional(),
  currency: z.string().min(3).max(3).optional(),
  kind: z.enum(['expense', 'income', 'refund']).optional(),
});
export type ExpenseExportQuery = z.infer<typeof ExpenseExportQuerySchema>;

