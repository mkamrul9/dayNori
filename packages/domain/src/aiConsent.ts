/**
 * Phase 55 — Versioned AI consent, eligible source rules, citation binding, budget estimates.
 */

export const CURRENT_AI_CONSENT_VERSION = '2026-10-20.1';
export const CURRENT_AI_PROVIDER_DISCLOSURE_VERSION = 'openai-api-2026-10-20';

export const AI_DEFAULT_MONTHLY_TOKEN_BUDGET = 50_000;
export const AI_MAX_RETRIEVAL_CHUNKS = 8;
export const AI_MAX_CHUNK_CHARS = 1200;
export const AI_MAX_CONTEXT_CHARS = 8_000;
export const AI_MAX_OUTPUT_TOKENS = 800;
/** Overhead tokens reserved for system prompt + formatting. */
export const AI_PROMPT_OVERHEAD_TOKENS = 400;

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

/** Rough token estimate used for reservation (not billing-grade). */
export function estimateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Reservation = overhead + bounded input + max output.
 * Actual settlement may exceed this; accounting must record actual usage.
 */
export function estimateAiReservationTokens(input: {
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens: number;
}): number {
  return (
    AI_PROMPT_OVERHEAD_TOKENS +
    estimateTokenCount(input.systemPrompt) +
    estimateTokenCount(input.userPrompt) +
    Math.max(1, input.maxOutputTokens)
  );
}

export type AiSourceRef = { itemId: string; revision: number };

const SOURCE_REF_RE =
  /\[source:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})#r(\d+)\]/gi;

/** Parse explicit source/revision markers from model text. */
export function parseAiSourceReferences(answer: string): AiSourceRef[] {
  const out: AiSourceRef[] = [];
  const seen = new Set<string>();
  for (const m of answer.matchAll(SOURCE_REF_RE)) {
    const itemId = m[1]!.toLowerCase();
    const revision = Number(m[2]);
    const key = `${itemId}#${revision}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ itemId, revision });
  }
  return out;
}

/**
 * Bind answer references to the authorized context set.
 * Rejects unknown ids, wrong revisions, bare UUIDs without #rN, and unsupported formats.
 */
export function bindAiCitations(input: {
  answer: string;
  authorized: Array<{ itemId: string; revision: number; kind: string; excerpt: string }>;
}): {
  ok: boolean;
  abstainReason: string | null;
  referenced: Array<{ itemId: string; revision: number; kind: string; excerpt: string }>;
} {
  if (/^ABSTAIN:/i.test(input.answer.trim())) {
    return { ok: true, abstainReason: 'model_abstain', referenced: [] };
  }

  const authorizedKeys = new Map(
    input.authorized.map((c) => [`${c.itemId.toLowerCase()}#${c.revision}`, c])
  );

  // Bare UUIDs or #r mismatches are unsupported citation formats.
  const bareUuid = [
    ...input.answer.matchAll(
      /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?!#r\d+)/gi
    ),
  ];
  if (bareUuid.length > 0) {
    return { ok: false, abstainReason: 'unsupported_citation_format', referenced: [] };
  }

  const refs = parseAiSourceReferences(input.answer);
  if (refs.length === 0) {
    return { ok: false, abstainReason: 'insufficient_support', referenced: [] };
  }

  const referenced: Array<{ itemId: string; revision: number; kind: string; excerpt: string }> = [];
  for (const ref of refs) {
    const hit = authorizedKeys.get(`${ref.itemId}#${ref.revision}`);
    if (!hit) {
      return { ok: false, abstainReason: 'unauthorized_or_stale_citation', referenced: [] };
    }
    referenced.push(hit);
  }
  return { ok: true, abstainReason: null, referenced };
}

/**
 * Document/filename/snippet text is untrusted data — never an authorization signal.
 * Authorization/tool boundaries are enforced in application code independently of model text.
 */
export function treatRetrievedTextAsUntrustedData(_text: string): void {
  void _text;
}
