import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';

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
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
  deletedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ExpenseItem = z.infer<typeof ExpenseItemSchema>;

export const CreateExpenseBodySchema = z.object({
  kind: ExpenseKindSchema.default('expense'),
  amount: z.union([z.string(), z.number()]), // Decimal string "12.50" or integer
  currency: z.string().trim().min(3).max(3),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  occurredAt: z.string().datetime().optional().nullable(),
  timezone: z.string().trim().default('UTC').optional(),
  categoryId: z.string().uuid().optional().nullable(),
  paymentLabel: z.string().trim().max(100).optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
  receiptFileId: z.string().uuid().optional().nullable(),
  originalExpenseId: z.string().uuid().optional().nullable(),
  folderId: z.string().uuid().optional().nullable(),
});
export type CreateExpenseBody = z.infer<typeof CreateExpenseBodySchema>;

export const UpdateExpenseBodySchema = z.object({
  amount: z.union([z.string(), z.number()]).optional(),
  currency: z.string().trim().min(3).max(3).optional(),
  transactionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  occurredAt: z.string().datetime().optional().nullable(),
  timezone: z.string().trim().optional(),
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
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  kind: ExpenseKindSchema.optional(),
  categoryId: z.string().uuid().optional(),
  currency: z.string().min(3).max(3).optional(),
  folderId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50).optional(),
  cursor: z.string().optional(),
});
export type ExpenseListQuery = z.infer<typeof ExpenseListQuerySchema>;

export const ExpenseListResponseSchema = z.object({
  data: z.array(ExpenseItemSchema),
  meta: ResponseMetaSchema,
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
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ExpenseRecurringTemplate = z.infer<typeof ExpenseRecurringTemplateSchema>;

export const CreateExpenseRecurringTemplateBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(['expense', 'income']),
  amount: z.union([z.string(), z.number()]),
  currency: z.string().trim().min(3).max(3),
  categoryId: z.string().uuid().optional().nullable(),
  paymentLabel: z.string().trim().max(100).optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
  schedule: RecurringScheduleSchema,
  timezone: z.string().trim().default('UTC').optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
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
