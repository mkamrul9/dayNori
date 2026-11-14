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

export type AuthorizedCitationRecord = {
  itemId: string;
  revision: number;
  kind: string;
  excerpt: string;
  deepLink?: string;
};

const SOURCE_REF_RE =
  /\[source:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|help:[a-z0-9_.-]+)#(?:r|v)(\d+)\]/gi;

/** Parse explicit source/revision markers from model text (supports UUIDs and versioned Help). */
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
 * Rejects unknown ids, wrong revisions, bare UUIDs without #rN/#vN, and unsupported formats.
 */
export function bindAiCitations(input: {
  answer: string;
  authorized: AuthorizedCitationRecord[];
}): {
  ok: boolean;
  abstainReason: string | null;
  referenced: AuthorizedCitationRecord[];
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
      /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?!#(?:r|v)\d+)/gi
    ),
  ];
  if (bareUuid.length > 0) {
    return { ok: false, abstainReason: 'unsupported_citation_format', referenced: [] };
  }

  const refs = parseAiSourceReferences(input.answer);
  if (refs.length === 0) {
    return { ok: false, abstainReason: 'insufficient_support', referenced: [] };
  }

  const referenced: AuthorizedCitationRecord[] = [];
  for (const ref of refs) {
    const hit = authorizedKeys.get(`${ref.itemId}#${ref.revision}`);
    if (!hit) {
      return { ok: false, abstainReason: 'unauthorized_or_stale_citation', referenced: [] };
    }
    referenced.push(hit);
  }
  return { ok: true, abstainReason: null, referenced };
}

/** Stop words for English retrieval query preprocessing. */
export const ENGLISH_AI_STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any',
  'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between',
  'both', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during',
  'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have', 'having', 'he', 'her',
  'here', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'i', 'if', 'in', 'into',
  'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most', 'my', 'myself', 'no',
  'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours',
  'ourselves', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such',
  'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there',
  'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up',
  'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who',
  'whom', 'why', 'will', 'with', 'would', 'you', 'your', 'yours', 'yourself',
  'yourselves', 'tell', 'show', 'give', 'find', 'get', 'list', 'explain',
]);

/** Stop words for Bangla retrieval query preprocessing. */
export const BANGLA_AI_STOP_WORDS = new Set([
  'কী', 'কি', 'কেন', 'কোথায়', 'কোথায়', 'কবে', 'কেমন', 'কে', 'কার', 'কাকে',
  'ছিল', 'আছে', 'হবে', 'একটি', 'এবং', 'ও', 'এই', 'সেই', 'আমার', 'তোমার',
  'তার', 'আমাদের', 'তোমাদের', 'তাদের', 'বল', 'বলো', 'দেখাও', 'খুঁজে', 'খুজুন',
  'দেও', 'দাও', 'করব', 'করবো', 'পারি', 'পারব', 'পারে', 'হচ্ছে', 'হয়েছে',
  'হয়েছে', 'না', 'হ্যাঁ', 'জন্য', 'থেকে', 'দ্বারা', 'বলা', 'করতে', 'গেলে',
]);

export function extractInformativeQueryTerms(rawQuery: string): {
  normalized: string;
  allTokens: string[];
  contentTerms: string[];
} {
  const normalized = String(rawQuery || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return { normalized: '', allTokens: [], contentTerms: [] };
  }

  const allTokens = normalized.split(' ').filter((t) => t.length > 0);
  const contentTerms = allTokens.filter((token) => {
    if (/^\d+$/.test(token) && token.length < 4) return false;
    if (ENGLISH_AI_STOP_WORDS.has(token)) return false;
    if (BANGLA_AI_STOP_WORDS.has(token)) return false;
    return token.length >= 2;
  });

  return {
    normalized,
    allTokens,
    contentTerms: contentTerms.length > 0 ? contentTerms : allTokens,
  };
}

/**
 * Sentence- and boundary-aware text chunking.
 * Preserves paragraphs, sentences (including Bengali dori ।), and words whole without mid-word cuts.
 */
export function chunkTextSmart(
  text: string,
  maxChars = AI_MAX_CHUNK_CHARS,
  overlapChars = 100
): string[] {
  const cleaned = text.normalize('NFKC').replace(/\r\n/g, '\n').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChars) return [cleaned];

  const sentenceRegex = /[^.!?\n\u0964]+[.!?\n\u0964]+|\S+$/gu;
  const rawSentences = cleaned.match(sentenceRegex) ?? [cleaned];
  const sentences = rawSentences.map((s) => s.trim()).filter((s) => s.length > 0);

  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    if (!currentChunk) {
      if (sentence.length > maxChars) {
        const words = sentence.split(/\s+/);
        let subChunk = '';
        for (const w of words) {
          if ((subChunk + ' ' + w).trim().length > maxChars) {
            if (subChunk) chunks.push(subChunk.trim());
            subChunk = w;
          } else {
            subChunk = subChunk ? subChunk + ' ' + w : w;
          }
        }
        if (subChunk) currentChunk = subChunk.trim();
      } else {
        currentChunk = sentence;
      }
    } else if ((currentChunk + ' ' + sentence).length <= maxChars) {
      currentChunk += ' ' + sentence;
    } else {
      chunks.push(currentChunk.trim());
      const tail = currentChunk.slice(-overlapChars).trim();
      const tailWords = tail.split(/\s+/).slice(1).join(' ');
      currentChunk = tailWords ? `${tailWords} ${sentence}` : sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.slice(0, 40);
}

export const AI_APPROVED_ATTACHMENT_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
]);

export const AI_MAX_ATTACHMENT_BYTES = 200 * 1024; // 200 KB
export const AI_MAX_ATTACHMENT_EXTRACT_CHARS = 4000;

export type AttachmentAiEligibility = {
  eligible: boolean;
  reason: string | null;
};

/**
 * Returns true if the target item or payload is vault-scoped or represents a vault item.
 * Strictly used to exclude vault content from AI processing, indexing, and proposals.
 */
export function isVaultAiTarget(
  kind?: string | null,
  securityScope?: string | null
): boolean {
  if (securityScope === 'vault') return true;
  if (!kind) return false;
  const lower = kind.toLowerCase();
  return lower === 'vault' || lower === 'vault_item' || lower === 'encrypted_vault';
}

export function checkAttachmentAiEligibility(input: {
  mimeType: string;
  byteSize: number;
  quarantineStatus: string;
  securityScope?: string | null;
}): AttachmentAiEligibility {
  if (input.securityScope === 'vault') {
    return { eligible: false, reason: 'vault_encrypted' };
  }
  if (input.quarantineStatus !== 'clean' && input.quarantineStatus !== 'verified') {
    return {
      eligible: false,
      reason: input.quarantineStatus === 'pending' ? 'unscanned_pending' : 'quarantined',
    };
  }
  if (!AI_APPROVED_ATTACHMENT_MIME_TYPES.has(input.mimeType)) {
    return { eligible: false, reason: 'unsupported_mime_type' };
  }
  if (input.byteSize > AI_MAX_ATTACHMENT_BYTES) {
    return { eligible: false, reason: 'size_exceeded' };
  }
  return { eligible: true, reason: null };
}

/**
 * Document/filename/snippet text is untrusted data — never an authorization signal.
 * Authorization/tool boundaries are enforced in application code independently of model text.
 */
export function treatRetrievedTextAsUntrustedData(_text: string): void {
  void _text;
}

/**
 * Sanitizes model-generated Assistant output before rendering:
 * 1. Strips dangerous executable HTML tags.
 * 2. Neutralizes dangerous URL schemes in markdown links (javascript:, vbscript:, data:, file:).
 * 3. Neutralizes remote markdown image fetches (![...](https?://...)) to prevent context-leaking tracking pixels.
 * 4. Preserves headings, lists, bold/italic, blockquotes, code fences, and citation markers.
 */
export function sanitizeAssistantMarkdown(rawText: string): string {
  if (!rawText) return '';
  let sanitized = rawText;

  // 1. Strip all HTML tags
  sanitized = sanitized.replace(/<\/?(?:[a-z0-9_-]+)\b[^>]*>/gi, '');

  // 2. Neutralize dangerous URL schemes in markdown links: [text](javascript:...) -> [text](#)
  sanitized = sanitized.replace(/\[([^\]]+)\]\((.*?)\)/gi, (match, label, url) => {
    const trimmed = url.trim().toLowerCase();
    if (
      trimmed.startsWith('javascript:') ||
      trimmed.startsWith('vbscript:') ||
      trimmed.startsWith('data:') ||
      trimmed.startsWith('file:')
    ) {
      return `[${label}](#)`;
    }
    return match;
  });

  // 3. Neutralize remote tracking images: ![alt](http...) -> [Image: alt]
  sanitized = sanitized.replace(/!\[([^\]]*)\]\((.*?)\)/gi, (_match, alt) => {
    return `[Image: ${alt || 'illustration'}]`;
  });

  return sanitized;
}

export interface AssistantStarterSuggestion {
  id: string;
  label: string;
  question: string;
  category: 'help' | 'notes' | 'tasks' | 'routines' | 'sync';
}

export type StarterSuggestion = AssistantStarterSuggestion;

export const ASSISTANT_STARTER_SUGGESTIONS: readonly AssistantStarterSuggestion[] = [
  {
    id: 'starter-trash-recovery',
    label: 'Restore from Trash',
    question: 'How do I restore a deleted note from trash?',
    category: 'help',
  },
  {
    id: 'starter-study-notes',
    label: 'Workspace Notes',
    question: 'What study notes or reading plans do I have?',
    category: 'notes',
  },
  {
    id: 'starter-tasks-plan',
    label: 'Upcoming Tasks',
    question: 'What tasks or todo items are scheduled?',
    category: 'tasks',
  },
  {
    id: 'starter-offline-sync',
    label: 'Offline & Sync',
    question: 'How does Daynori work offline and resolve sync conflicts?',
    category: 'sync',
  },
  {
    id: 'starter-routines-habits',
    label: 'Routines & Habits',
    question: 'How do I set up and track daily routines or habits?',
    category: 'routines',
  },
  {
    id: 'starter-vault-security',
    label: 'Vault Security',
    question: 'How does the client-encrypted Vault protect secrets?',
    category: 'help',
  },
] as const;
