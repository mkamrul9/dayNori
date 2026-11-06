/**
 * Phase 55 — Versioned AI consent, eligible source rules, citation binding, budget estimates.
 * Phase 90 — Precise monetary accounting and provider rate models.
 */

export const CURRENT_AI_CONSENT_VERSION = '2026-10-20.1';
export const CURRENT_AI_PROVIDER_DISCLOSURE_VERSION = 'openai-api-2026-10-20';

/**
 * Phase 90: Precise monetary accounting.
 * Pricing rates per 1,000,000 tokens for official candidate models:
 * - gpt-4o-mini: $0.150 / 1M input (0.150 micro-USD/token), $0.600 / 1M output (0.600 micro-USD/token)
 * - gpt-4o: $2.50 / 1M input, $10.00 / 1M output
 * - claude-3-5-haiku: $1.00 / 1M input, $5.00 / 1M output
 * - gemini-1.5-flash: $0.075 / 1M input (<=128k), $0.30 / 1M output
 */
export type AiModelRate = {
  inputMicrosPerToken: number;
  outputMicrosPerToken: number;
};

export const AI_MODEL_RATES: Record<string, AiModelRate> = {
  'gpt-4o-mini': {
    inputMicrosPerToken: 0.15,
    outputMicrosPerToken: 0.6,
  },
  'gpt-4o': {
    inputMicrosPerToken: 2.5,
    outputMicrosPerToken: 10.0,
  },
  'claude-3-5-haiku': {
    inputMicrosPerToken: 1.0,
    outputMicrosPerToken: 5.0,
  },
  'gemini-1.5-flash': {
    inputMicrosPerToken: 0.075,
    outputMicrosPerToken: 0.3,
  },
};

export type AiCostCalculation = {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  inputCostMicros: number;
  outputCostMicros: number;
  totalCostMicros: number;
  totalCostUsd: number;
};

export function calculateEstimatedAiCost(
  promptTokens: number,
  completionTokens: number,
  model = 'gpt-4o-mini'
): AiCostCalculation {
  const rate = AI_MODEL_RATES[model] ?? AI_MODEL_RATES['gpt-4o-mini']!;
  const inputCostMicros = Math.round(promptTokens * rate.inputMicrosPerToken * 100) / 100;
  const outputCostMicros = Math.round(completionTokens * rate.outputMicrosPerToken * 100) / 100;
  const totalCostMicros = Math.round((inputCostMicros + outputCostMicros) * 100) / 100;
  const totalCostUsd = Math.round(totalCostMicros) / 1_000_000;
  return {
    model,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    inputCostMicros,
    outputCostMicros,
    totalCostMicros,
    totalCostUsd,
  };
}

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
