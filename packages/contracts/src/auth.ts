import { z } from 'zod';

/**
 * Sign-up request payload contract.
 */
export const SignUpRequestSchema = z.object({
  email: z.string().trim().email('Invalid email address').max(255),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password must not exceed 128 characters'),
  displayName: z.string().trim().min(1).max(64).optional(),
});
export type SignUpRequest = z.infer<typeof SignUpRequestSchema>;

/**
 * Sign-up response contract.
 */
export const SignUpResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
  }),
  requiresVerification: z.boolean(),
  message: z.string().optional(),
});
export type SignUpResponse = z.infer<typeof SignUpResponseSchema>;

/**
 * Sign-in request payload contract.
 */
export const SignInRequestSchema = z.object({
  email: z.string().trim().email('Invalid email address').max(255),
  password: z.string().min(1, 'Password is required').max(128),
});
export type SignInRequest = z.infer<typeof SignInRequestSchema>;

/**
 * Sign-in response contract.
 */
export const SignInResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string().optional(),
  }),
  csrfToken: z.string().optional(),
});
export type SignInResponse = z.infer<typeof SignInResponseSchema>;

/**
 * Password recovery request contract.
 */
export const PasswordRecoveryRequestSchema = z.object({
  email: z.string().trim().email('Invalid email address').max(255),
});
export type PasswordRecoveryRequest = z.infer<typeof PasswordRecoveryRequestSchema>;

/**
 * Password reset request contract.
 */
export const PasswordResetRequestSchema = z.object({
  token: z.string().min(1).max(512),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password must not exceed 128 characters'),
});
export type PasswordResetRequest = z.infer<typeof PasswordResetRequestSchema>;

/**
 * Standard message response for auth operations.
 */
export const AuthMessageResponseSchema = z.object({
  status: z.enum(['ok', 'error']),
  message: z.string(),
});
export type AuthMessageResponse = z.infer<typeof AuthMessageResponseSchema>;

/**
 * Session verification state contract.
 */
export const AuthSessionSchema = z.object({
  authenticated: z.boolean(),
  user: z
    .object({
      id: z.string().uuid(),
      email: z.string().email(),
      displayName: z.string().optional(),
    })
    .nullable(),
  expiresAt: z.number().int().positive().optional(),
  csrfToken: z.string().optional(),
});
export type AuthSession = z.infer<typeof AuthSessionSchema>;

/**
 * Auth callback query parameters contract.
 */
export const AuthCallbackQuerySchema = z.object({
  code: z.string().max(256).optional(),
  token: z.string().max(512).optional(),
  type: z.string().max(64).optional(),
  error: z.string().max(128).optional(),
  error_description: z.string().max(256).optional(),
  state: z.string().max(256).optional(),
  next: z.string().max(256).optional(),
});
export type AuthCallbackQuery = z.infer<typeof AuthCallbackQuerySchema>;

/**
 * Quarantined unsent draft contract for preserving drafts on logout without cross-user leakage.
 */
export const QuarantinedDraftSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  quarantinedAt: z.string().datetime(),
  draftType: z.enum(['create_item', 'journal_entry', 'quick_note']),
  payload: z.record(z.unknown()),
});
export type QuarantinedDraft = z.infer<typeof QuarantinedDraftSchema>;

/**
 * Validates and bounds redirect URLs against an explicit origin allowlist.
 * Prevents open redirects, protocol-relative bypasses, and javascript:/data: execution.
 */
export function validateAuthRedirectUrl(
  url: string | null | undefined,
  allowedOrigins: string[] = [
    'http://localhost:3000',
    'https://app.daynori.com',
    'https://daynori.app',
  ]
): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  const trimmed = url.trim();

  // 1. Safe relative paths (e.g. /today, /journal)
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\')) {
    // Ensure no control characters or embedded backslashes
    for (let i = 0; i < trimmed.length; i++) {
      const code = trimmed.charCodeAt(i);
      if (code < 32 || code === 127 || code === 92) {
        return null;
      }
    }
    return trimmed;
  }

  // 2. Absolute URLs matching allowed origin list
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (allowedOrigins.includes(parsed.origin)) {
      return parsed.pathname + parsed.search + parsed.hash;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Generates a high-entropy CSRF double-submit token.
 */
export function generateCsrfToken(): string {
  // Use Web Crypto API or Node crypto
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Compares two CSRF tokens using safe string comparison.
 */
export function verifyCsrfToken(cookieToken?: string, headerToken?: string): boolean {
  if (!cookieToken || !headerToken) {
    return false;
  }
  if (typeof cookieToken !== 'string' || typeof headerToken !== 'string') {
    return false;
  }
  if (cookieToken.length !== headerToken.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < cookieToken.length; i++) {
    result |= cookieToken.charCodeAt(i) ^ headerToken.charCodeAt(i);
  }
  return result === 0;
}
