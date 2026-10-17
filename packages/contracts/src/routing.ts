import { z } from 'zod';

/**
 * Approved parent and child navigation destinations in the Daynori mobile shell.
 */
export const ApprovedDestinationSchema = z.enum([
  'today',
  'plan',
  'plan/tasks',
  'plan/routines',
  'plan/calendar',
  'library',
  'library/folders',
  'library/notes',
  'library/files',
  'journal',
  'settings',
  'help',
  'review',
]);
export type ApprovedDestination = z.infer<typeof ApprovedDestinationSchema>;

/**
 * Destinations requiring active workspace authentication before displaying content.
 */
export const ProtectedDestinationSchema = z.enum(['journal', 'item', 'file']);
export type ProtectedDestination = z.infer<typeof ProtectedDestinationSchema>;

/**
 * Bounded safe identifier schema rejecting path traversal, injections, and control characters.
 * Restricts to alphanumeric characters, dashes, and underscores (1–64 characters).
 */
export const SafeIdentifierSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    'Identifier must contain only alphanumeric characters, dashes, or underscores'
  );

/**
 * Notification payload contract.
 */
export const NotificationPayloadSchema = z.object({
  type: z.literal('notification'),
  destination: ApprovedDestinationSchema,
  itemId: SafeIdentifierSchema.optional(),
  action: z.string().max(64).optional(),
  instanceId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  ruleRevision: z.number().int().positive().optional(),
  deliveryGeneration: z.number().int().positive().optional(),
  targetType: z.enum(['task', 'routine', 'calendar_event']).optional(),
  timestamp: z.number().int().positive().optional(),
  nonce: z.string().max(64).optional(),
});
export type NotificationPayload = z.infer<typeof NotificationPayloadSchema>;

/**
 * File link payload contract.
 */
export const FilePayloadSchema = z.object({
  type: z.literal('file'),
  destination: z.literal('library'),
  fileId: SafeIdentifierSchema,
  mimeType: z.string().max(128).optional(),
  timestamp: z.number().int().positive().optional(),
  nonce: z.string().max(64).optional(),
});
export type FilePayload = z.infer<typeof FilePayloadSchema>;

/**
 * Authentication callback payload contract.
 */
export const AuthPayloadSchema = z.object({
  type: z.literal('auth'),
  destination: z.literal('auth-callback'),
  token: z.string().min(1).max(512).optional(),
  code: z.string().min(1).max(512).optional(),
  state: z.string().min(1).max(256).optional(),
  error: z.string().max(128).optional(),
  timestamp: z.number().int().positive().optional(),
  nonce: z.string().max(64).optional(),
});
export type AuthPayload = z.infer<typeof AuthPayloadSchema>;

/**
 * Discriminated union of all supported external deep link payloads.
 */
export const DeepLinkPayloadSchema = z.discriminatedUnion('type', [
  NotificationPayloadSchema,
  FilePayloadSchema,
  AuthPayloadSchema,
]);
export type DeepLinkPayload = z.infer<typeof DeepLinkPayloadSchema>;

export interface DeepLinkParseResult {
  success: boolean;
  payload?: DeepLinkPayload;
  error?: string;
}

export const APPROVED_SCHEMES = new Set(['daynori:']);
export const APPROVED_HTTPS_HOSTS = new Set(['app.daynori.com', 'daynori.app']);

/**
 * Parses and strictly validates a deep link URL or raw payload.
 * Strictly enforces approved schemes (daynori://) and approved HTTPS origins (https://app.daynori.com/).
 * Rejects unexpected origins, malformed numeric values, ambiguous payloads, and path traversal attempts.
 * Redacts tokens and private query parameters from all error messages.
 */
export function parseDeepLinkUrl(rawUrl: string): DeepLinkParseResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { success: false, error: 'Empty or invalid URL input' };
  }

  const trimmed = rawUrl.trim();

  // Validate approved scheme prefix before parsing
  const isDaynoriScheme = trimmed.startsWith('daynori://');
  const isHttpsScheme = trimmed.startsWith('https://');

  if (!isDaynoriScheme && !isHttpsScheme) {
    return {
      success: false,
      error:
        'Unauthorized or unsupported URL scheme: link must use daynori:// or approved https:// origin',
    };
  }

  try {
    let parsed: URL;

    if (isDaynoriScheme) {
      // Normalize daynori://path?query to http://daynori.internal/path?query for standard URL parsing
      const pathAndQuery = trimmed.slice('daynori://'.length);
      // Reject nested schemes or embedded authority traversal e.g. daynori://https://evil.com
      if (pathAndQuery.includes('://') || pathAndQuery.startsWith('//')) {
        return { success: false, error: 'Malformed or ambiguous URL path structure' };
      }
      parsed = new URL(`http://daynori.internal/${pathAndQuery}`);
    } else {
      parsed = new URL(trimmed);
      // Enforce approved HTTPS host whitelist
      if (!APPROVED_HTTPS_HOSTS.has(parsed.hostname.toLowerCase())) {
        return {
          success: false,
          error: `Rejected unapproved HTTPS origin: host "${parsed.hostname}" is not authorized for Daynori navigation`,
        };
      }
    }

    const pathname = parsed.pathname.replace(/^\/+|\/+$/g, '');
    const searchParams = parsed.searchParams;

    // Helper for strict positive integer timestamp validation
    const tsRaw = searchParams.get('timestamp');
    let timestamp: number | undefined = undefined;
    if (tsRaw !== null) {
      if (!/^\d+$/.test(tsRaw)) {
        return {
          success: false,
          error: 'Malformed numeric timestamp parameter: must be a positive integer',
        };
      }
      const parsedTs = Number(tsRaw);
      if (!Number.isSafeInteger(parsedTs) || parsedTs <= 0) {
        return { success: false, error: 'Invalid timestamp value: out of valid integer range' };
      }
      timestamp = parsedTs;
    }

    // The primary route identifier is either query param 'type' or first segment of pathname
    const firstSegment = pathname.split('/')[0];
    const typeParam = searchParams.get('type') || firstSegment;

    if (typeParam === 'notification') {
      const destinationRaw =
        searchParams.get('destination') || pathname.replace(/^notification\/?/, '') || 'today';
      const itemId = searchParams.get('itemId') || undefined;
      const action = searchParams.get('action') || undefined;
      const nonce = searchParams.get('nonce') || undefined;

      const result = NotificationPayloadSchema.safeParse({
        type: 'notification',
        destination: destinationRaw,
        itemId,
        action,
        timestamp,
        nonce,
      });

      if (!result.success) {
        return {
          success: false,
          error: `Invalid notification payload: ${result.error.issues.map((i) => i.message).join(', ')}`,
        };
      }
      return { success: true, payload: result.data };
    }

    if (typeParam === 'file') {
      const fileId = searchParams.get('fileId') || pathname.replace(/^file\/?/, '') || undefined;
      const mimeType = searchParams.get('mimeType') || undefined;
      const nonce = searchParams.get('nonce') || undefined;

      const result = FilePayloadSchema.safeParse({
        type: 'file',
        destination: 'library',
        fileId,
        mimeType,
        timestamp,
        nonce,
      });

      if (!result.success) {
        return {
          success: false,
          error: `Invalid file payload: ${result.error.issues.map((i) => i.message).join(', ')}`,
        };
      }
      return { success: true, payload: result.data };
    }

    if (typeParam === 'auth' || typeParam === 'auth-callback') {
      const token = searchParams.get('token') || undefined;
      const code = searchParams.get('code') || undefined;
      const state = searchParams.get('state') || undefined;
      const error = searchParams.get('error') || undefined;
      const nonce = searchParams.get('nonce') || undefined;

      const result = AuthPayloadSchema.safeParse({
        type: 'auth',
        destination: 'auth-callback',
        token,
        code,
        state,
        error,
        timestamp,
        nonce,
      });

      if (!result.success) {
        return {
          success: false,
          error: `Invalid auth payload: ${result.error.issues.map((i) => i.message).join(', ')}`,
        };
      }
      return { success: true, payload: result.data };
    }

    // Direct destination navigation e.g. daynori://today or daynori://plan/calendar
    const directDest = ApprovedDestinationSchema.safeParse(pathname);
    if (directDest.success) {
      return {
        success: true,
        payload: {
          type: 'notification',
          destination: directDest.data,
        },
      };
    }

    // Never echo sensitive parameters in failure messages
    const safePathContext = pathname ? `path: /${pathname}` : 'root';
    return {
      success: false,
      error: `Unrecognized destination or link structure at ${safePathContext}`,
    };
  } catch (err) {
    return { success: false, error: `Malformed URL structure: ${(err as Error).message}` };
  }
}
