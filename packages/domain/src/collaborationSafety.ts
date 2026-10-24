/**
 * Phase 54 — Collaboration safety policy primitives (provisional local).
 * Distinguishes mute / block / hide / membership removal / moderation deletion.
 */

/** Current acceptable-use / community rules version required before UGC contribution. */
export const CURRENT_UGC_POLICY_VERSION = '2026-10-20.1';

export const UGC_REPORT_CATEGORIES = [
  'harassment',
  'hate',
  'sexual_content',
  'spam',
  'scam',
  'violence',
  'illegal',
  'other',
] as const;

export type UgcReportCategory = (typeof UGC_REPORT_CATEGORIES)[number];

export const UGC_REPORT_EXPLANATION_MAX = 1000;
export const UGC_REPORT_RATE_LIMIT_COUNT = 20;
export const UGC_REPORT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/** Per-actor invitation create rate (abuse resistance beyond pending-per-room cap). */
export const ROOM_INVITE_CREATE_RATE_LIMIT_COUNT = 100;
export const ROOM_INVITE_CREATE_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export type UgcReportTargetType = 'message' | 'user';

export type UgcReportStatus =
  | 'received'
  | 'triaged'
  | 'actioned'
  | 'dismissed'
  | 'duplicate';

/**
 * Block semantics (ADR 0051):
 * - Mute: notification suppression only (existing room mute).
 * - Block: stops invitations between the pair; optionally hides the blocked
 *   user's messages for the blocker's client view. Does NOT revoke the other
 *   member's authorized room access or delete shared room history for others.
 * - Hide: client-side filter for the blocker (derived from block).
 * - Membership removal: room-owner/admin action; distinct from block.
 * - Moderation deletion: message soft-delete / account restriction by authorized
 *   room owner (room scope) or platform moderator (platform scope).
 */
export type InteractionRestrictionKind =
  | 'mute_notifications'
  | 'block_interactions'
  | 'hide_content'
  | 'remove_membership'
  | 'moderation_deletion';

export function isUgcReportCategory(value: string): value is UgcReportCategory {
  return (UGC_REPORT_CATEGORIES as readonly string[]).includes(value);
}

export function validateReportExplanation(
  explanation: string | null | undefined
): { ok: true; explanation: string | null } | { ok: false; message: string } {
  if (explanation == null || explanation === '') {
    return { ok: true, explanation: null };
  }
  const trimmed = explanation.trim();
  if (trimmed.length > UGC_REPORT_EXPLANATION_MAX) {
    return {
      ok: false,
      message: `Explanation must be at most ${UGC_REPORT_EXPLANATION_MAX} characters`,
    };
  }
  return { ok: true, explanation: trimmed };
}

export function validatePolicyVersion(
  version: string
): { ok: true } | { ok: false; message: string } {
  if (!version || version.length > 64) {
    return { ok: false, message: 'Invalid policy version' };
  }
  return { ok: true };
}

export function requiresCurrentTermsAcceptance(
  acceptedVersion: string | null | undefined,
  currentVersion: string = CURRENT_UGC_POLICY_VERSION
): boolean {
  return acceptedVersion !== currentVersion;
}

/**
 * @deprecated Prefer `app.platform_moderators` + `app.is_platform_moderator`.
 * Env parsing remains only for local bootstrap scripts — not an authorization boundary.
 */
export function parsePlatformModeratorIds(env: NodeJS.ProcessEnv | Record<string, string | undefined>): Set<string> {
  const raw = env['DAYNORI_PLATFORM_MODERATOR_IDS'] ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  );
}
