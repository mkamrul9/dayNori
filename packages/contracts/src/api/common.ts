import { z } from 'zod';

/**
 * Standard API error codes conforming to architecture/api-conventions.md
 */
export const ApiErrorCode = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  ACCESS_REVOKED: 'ACCESS_REVOKED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  REVISION_CONFLICT: 'REVISION_CONFLICT',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  DEPENDENCY_PENDING: 'DEPENDENCY_PENDING',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  UPLOAD_NOT_READY: 'UPLOAD_NOT_READY',
  SYNC_RESET_REQUIRED: 'SYNC_RESET_REQUIRED',
  OPERATION_TOO_OLD: 'OPERATION_TOO_OLD',
  RATE_LIMITED: 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  PROVIDER_RECONNECT_REQUIRED: 'PROVIDER_RECONNECT_REQUIRED',
  TEMPORARILY_UNAVAILABLE: 'TEMPORARILY_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  MEMBERSHIP_REVOKED: 'MEMBERSHIP_REVOKED',
  ROOM_ARCHIVED: 'ROOM_ARCHIVED',
} as const;

export type ApiErrorCodeType = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export const ApiErrorCodeSchema = z.enum([
  'UNAUTHENTICATED',
  'ACCESS_REVOKED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'REVISION_CONFLICT',
  'IDEMPOTENCY_KEY_REUSED',
  'DEPENDENCY_PENDING',
  'QUOTA_EXCEEDED',
  'UPLOAD_NOT_READY',
  'SYNC_RESET_REQUIRED',
  'OPERATION_TOO_OLD',
  'RATE_LIMITED',
  'PAYLOAD_TOO_LARGE',
  'PROVIDER_RECONNECT_REQUIRED',
  'TEMPORARILY_UNAVAILABLE',
  'INTERNAL_ERROR',
  'MEMBERSHIP_REVOKED',
  'ROOM_ARCHIVED',
]);

/**
 * Canonical response metadata included on successful API responses
 */
export const ResponseMetaSchema = z.object({
  requestId: z.string().min(1),
  serverTime: z.string().datetime(),
  cursor: z.string().optional(),
});

export type ResponseMeta = z.infer<typeof ResponseMetaSchema>;

/**
 * Optional granular field validation error detail
 */
export const ApiErrorDetailSchema = z.object({
  field: z.string().optional(),
  message: z.string(),
  code: z.string().optional(),
});

export type ApiErrorDetail = z.infer<typeof ApiErrorDetailSchema>;

/**
 * Standard safe structured error payload
 */
export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
  details: z.array(ApiErrorDetailSchema).optional(),
  retryAfter: z.number().int().nonnegative().optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * Canonical error response wrapper
 */
export const ApiErrorResponseSchema = z.object({
  error: ApiErrorSchema,
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

/**
 * Standard Keyset pagination query parameters
 */
export const KeysetPaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export type KeysetPaginationQuery = z.infer<typeof KeysetPaginationQuerySchema>;
