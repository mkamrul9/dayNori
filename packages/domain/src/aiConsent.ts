/**
 * Phase 55 — Versioned AI consent and eligible source rules.
 */

export const CURRENT_AI_CONSENT_VERSION = '2026-10-20.1';
export const CURRENT_AI_PROVIDER_DISCLOSURE_VERSION = 'openai-api-2026-10-20';

export const AI_DEFAULT_MONTHLY_TOKEN_BUDGET = 50_000;
export const AI_MAX_RETRIEVAL_CHUNKS = 8;
export const AI_MAX_CHUNK_CHARS = 1200;
export const AI_MAX_CONTEXT_CHARS = 8_000;
export const AI_MAX_OUTPUT_TOKENS = 800;

export type AiContentScope = {
  /** Personal workspace notes eligible for indexing/retrieval. */
  notes: boolean;
  /** Personal workspace tasks eligible. */
  tasks: boolean;
  /**
   * Journal AI requires a distinct explicit choice.
   * Ordinary journal visibility/search settings are insufficient.
   */
  journal: boolean;
};

export const DEFAULT_AI_CONTENT_SCOPE: AiContentScope = {
  notes: true,
  tasks: true,
  journal: false,
};

export function validateAiContentScope(
  scope: Partial<AiContentScope> | null | undefined
): AiContentScope {
  return {
    notes: scope?.notes !== false,
    tasks: scope?.tasks !== false,
    journal: scope?.journal === true,
  };
}

export function isAiSourceKindEligible(
  kind: string,
  securityScope: string | null | undefined,
  scope: AiContentScope
): boolean {
  if (securityScope === 'vault') return false;
  if (kind === 'journal' || kind === 'journal_entry') return scope.journal;
  if (kind === 'note') return scope.notes;
  if (kind === 'task' || kind === 'todo') return scope.tasks;
  return false;
}

/** Document/filename/snippet text is untrusted data — never an authorization signal. */
export function treatRetrievedTextAsUntrustedData(_text: string): void {
  // Marker for reviewers: authorization is enforced in application code only.
}
