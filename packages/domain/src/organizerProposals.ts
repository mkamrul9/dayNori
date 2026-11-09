/**
 * Phase 93 & Phase 94 — Structured organizer tools and multi-action creation.
 * Domain helpers for organizer proposal parsing, date/recurrence/amount ambiguity detection,
 * cross-reference resolution, dependency checking, voice and fact preservation, and canonical deep links.
 */

export interface JournalDateAmbiguityResult {
  isAmbiguous: boolean;
  clarificationQuestion?: string;
  inferredDate?: string;
}

export interface AmbiguityResult {
  isAmbiguous: boolean;
  clarificationQuestion?: string;
}

const ISO_DATE_REGEX = /\b(\d{4}-\d{2}-\d{2})\b/;

const RELATIVE_AMBIGUOUS_PATTERNS = [
  // English relative date references
  /\byesterday\b/i,
  /\blast\s+(?:night|week|weekend|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\ba\s+few\s+days\s+ago\b/i,
  /\bthe\s+other\s+day\b/i,
  /\bsometime\s+ago\b/i,
  /\brecently\b/i,
  /\ba\s+while\s+ago\b/i,
  // Bengali relative date references
  /গতকাল/,
  /গত\s*(?:রাত|সপ্তাহ|মাস|বছর|শুক্রবার|শনিবার|রবিবার|সোমবার|মঙ্গলবার|বুধবার|বৃহস্পতিবার)/,
  /কয়েকদিন\s*আগে/,
  /কিছুদিন\s*আগে/,
  /একদিন/,
];

/**
 * Detects whether a journal creation request contains ambiguous or relative date references
 * (e.g. "yesterday", "last Friday", "গতকাল") without an unambiguous YYYY-MM-DD date.
 * If ambiguous, produces a clarifying question rather than hallucinating dates.
 */
export function detectJournalDateAmbiguity(
  input: string,
  referenceDate?: string
): JournalDateAmbiguityResult {
  const trimmed = input.trim();

  // 1. Check for explicit ISO date (YYYY-MM-DD)
  const isoMatch = ISO_DATE_REGEX.exec(trimmed);
  if (isoMatch) {
    return {
      isAmbiguous: false,
      inferredDate: isoMatch[1],
    };
  }

  // 2. Check for "today" / "আজ"
  const isToday = /\btoday\b/i.test(trimmed) || /\bআজ\b/.test(trimmed) || /\bআজকে\b/.test(trimmed);
  if (isToday) {
    const todayStr = referenceDate ?? new Date().toISOString().slice(0, 10);
    return {
      isAmbiguous: false,
      inferredDate: todayStr,
    };
  }

  // 3. Check for ambiguous relative patterns
  const isBangla = /[\u0980-\u09FF]/.test(trimmed);
  for (const pattern of RELATIVE_AMBIGUOUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        isAmbiguous: true,
        clarificationQuestion: isBangla
          ? 'এই জার্নাল এন্ট্রিটি কোন তারিখের জন্য সংরক্ষণ করতে চান? অনুগ্রহ করে নির্দিষ্ট তারিখ উল্লেখ করুন (YYYY-MM-DD)।'
          : 'Which date should this journal entry be recorded for? Please specify the date (YYYY-MM-DD).',
      };
    }
  }

  // 4. If no date mentioned at all, require clarification
  return {
    isAmbiguous: true,
    clarificationQuestion: isBangla
      ? 'জার্নাল এন্ট্রির জন্য কোন তারিখ ব্যবহার করবেন? অনুগ্রহ করে নির্দিষ্ট তারিখ উল্লেখ করুন (YYYY-MM-DD)।'
      : 'What date should this journal entry be dated for? Please specify the date (YYYY-MM-DD).',
  };
}

/**
 * Detects whether a routine creation request contains ambiguous recurrence, scheduled time, or timezone.
 */
export function detectRoutineAmbiguity(input: string): AmbiguityResult {
  const trimmed = input.trim();
  const isBangla = /[\u0980-\u09FF]/.test(trimmed);

  const hasRecurrence =
    /\b(?:daily|every\s+day|everyday|weekdays?|every\s+weekdays?|weekly|every\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i.test(
      trimmed
    ) ||
    /প্রতিদিন|রোজ|প্রতি\s*(?:সোমবার|মঙ্গলবার|বুধবার|বৃহস্পতিবার|শুক্রবার|শনিবার|রবিবার)/.test(
      trimmed
    );

  if (!hasRecurrence) {
    return {
      isAmbiguous: true,
      clarificationQuestion: isBangla
        ? 'এই রুটিনের পুনরাবৃত্তি কীভাবে নির্ধারণ করতে চান (যেমন: প্রতিদিন, নাকি নির্দিষ্ট কর্মদিবস)?'
        : 'What recurrence should this routine follow (e.g. daily, or specific weekdays)?',
    };
  }

  return { isAmbiguous: false };
}

/**
 * Detects whether a calendar event creation request contains ambiguous date or all-day/timed scheduling.
 */
export function detectCalendarEventAmbiguity(input: string): AmbiguityResult {
  const trimmed = input.trim();
  const isBangla = /[\u0980-\u09FF]/.test(trimmed);

  const hasIsoDate = ISO_DATE_REGEX.test(trimmed);
  const hasRelative =
    /\b(?:today|tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i.test(
      trimmed
    ) || /আজ|আগামীকাল|পরশু/.test(trimmed);

  if (!hasIsoDate && !hasRelative) {
    return {
      isAmbiguous: true,
      clarificationQuestion: isBangla
        ? 'ইভেন্টটি কোন তারিখে বা সময়ে অনুষ্ঠিত হবে? অনুগ্রহ করে নির্দিষ্ট তারিখ উল্লেখ করুন (YYYY-MM-DD)।'
        : 'What date or time is this event scheduled for? Please specify the date (YYYY-MM-DD).',
    };
  }

  return { isAmbiguous: false };
}

/**
 * Detects whether an expense creation request contains ambiguous amount or currency.
 */
export function detectExpenseAmbiguity(input: string): AmbiguityResult {
  const trimmed = input.trim();
  const isBangla = /[\u0980-\u09FF]/.test(trimmed);

  // Check for amount (digits with optional decimal)
  const hasAmount = /\b\d+(?:\.\d{1,2})?\b/.test(trimmed);
  if (!hasAmount) {
    return {
      isAmbiguous: true,
      clarificationQuestion: isBangla
        ? 'খরচের পরিমাণ কত? অনুগ্রহ করে টাকার সংখ্যা উল্লেখ করুন।'
        : 'What was the amount of this expense?',
    };
  }

  // Check for currency: 3-letter code (USD, EUR, BDT, GBP, JPY, CAD) or symbol ($ / ৳ / € / £)
  const hasCurrency =
    /\b(?:USD|EUR|BDT|GBP|CAD|AUD|JPY|CHF|INR)\b/i.test(trimmed) ||
    /[$€£৳₹¥]/.test(trimmed) ||
    /টাকা|ডলার|ইউরো/.test(trimmed);

  if (!hasCurrency) {
    return {
      isAmbiguous: true,
      clarificationQuestion: isBangla
        ? 'খরচটি কোন মুদ্রায় সম্পন্ন হয়েছে (যেমন: BDT, USD, EUR)?'
        : 'What currency was used for this expense (e.g. USD, EUR, BDT)?',
    };
  }

  return { isAmbiguous: false };
}

/**
 * Resolves canonical deep link for any organizer item.
 * Conforms strictly to application navigation targets:
 * - Task: /plan?targetId=...&targetType=task
 * - Routine: /plan?targetId=...&targetType=routine
 * - Calendar Event: /plan/calendar?eventId=...
 * - Folder: /library?folderId=...
 * - Note: /library?noteId=...
 * - Custom Section: /custom-sections?sectionId=...
 * - Expense: /expenses?expenseId=...
 * - Journal entry: /journal?entryId=...
 */
export function getOrganizerDeepLink(kind: string, itemId: string): string {
  const encoded = encodeURIComponent(itemId);
  if (kind === 'task' || kind === 'todo') {
    return `/plan?targetId=${encoded}&targetType=task`;
  }
  if (kind === 'routine') {
    return `/plan?targetId=${encoded}&targetType=routine`;
  }
  if (kind === 'calendar_event' || kind === 'event') {
    return `/plan/calendar?eventId=${encoded}`;
  }
  if (kind === 'folder') {
    return `/library?folderId=${encoded}`;
  }
  if (kind === 'custom_section' || kind === 'section') {
    return `/custom-sections?sectionId=${encoded}`;
  }
  if (kind === 'expense') {
    return `/expenses?expenseId=${encoded}`;
  }
  if (kind === 'journal_entry' || kind === 'journal') {
    return `/journal?entryId=${encoded}`;
  }
  return `/library?noteId=${encoded}`;
}

/**
 * Validates and preserves user voice for organizer proposal text.
 * Strips dangerous control characters while preserving exact wording and language.
 */
export function sanitizeOrganizerText(text: string): string {
  if (!text) return '';
  return text.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '').trim();
}

/**
 * Recursively resolves references in a proposal payload using a map of already-created items.
 * Handles patterns such as:
 * - "$ref:0" -> step index 0
 * - "$ref:step_0" -> step index 0
 * - "$ref:<proposalId>" -> specific proposal ID
 */
export function resolveProposalCrossReferences(
  payload: Record<string, unknown>,
  createdItemMap: Map<string, { id: string; kind?: string }>
): Record<string, unknown> {
  function resolveValue(val: unknown): unknown {
    if (typeof val === 'string') {
      const match = /^\$ref:([a-zA-Z0-9_-]+)$/.exec(val.trim());
      if (match && match[1]) {
        const rawKey = match[1];
        const strippedKey = rawKey.replace(/^step_/, '');
        const resolved =
          createdItemMap.get(rawKey) ||
          createdItemMap.get(strippedKey) ||
          createdItemMap.get(`step_${rawKey}`);
        if (resolved) {
          return resolved.id;
        }
      }
      return val;
    }
    if (Array.isArray(val)) {
      return val.map(resolveValue);
    }
    if (val !== null && typeof val === 'object') {
      const copy: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        copy[k] = resolveValue(v);
      }
      return copy;
    }
    return val;
  }

  return resolveValue(payload) as Record<string, unknown>;
}

/**
 * Checks whether all dependencies of a step are satisfied by completed prerequisite step IDs.
 */
export function checkStepDependencies(
  dependsOn: string[] | undefined,
  completedStepIds: Set<string>
): { satisfied: boolean; missingPrerequisite?: string } {
  if (!dependsOn || dependsOn.length === 0) {
    return { satisfied: true };
  }
  for (const dep of dependsOn) {
    if (!completedStepIds.has(dep)) {
      return { satisfied: false, missingPrerequisite: dep };
    }
  }
  return { satisfied: true };
}
