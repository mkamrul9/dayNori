/**
 * Phase 93 — Reviewed note, task, and journal creation.
 * Domain helpers for organizer proposal parsing, date ambiguity detection,
 * voice and fact preservation, and canonical deep links.
 */

export interface JournalDateAmbiguityResult {
  isAmbiguous: boolean;
  clarificationQuestion?: string;
  inferredDate?: string;
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
 * Resolves canonical deep link for an organizer item.
 * Links conform strictly to application navigation targets:
 * - Task: /plan?targetId=...&targetType=task
 * - Journal entry: /journal?entryId=...
 * - Note: /library?noteId=...
 */
export function getOrganizerDeepLink(kind: string, itemId: string): string {
  const encoded = encodeURIComponent(itemId);
  if (kind === 'task' || kind === 'todo') {
    return `/plan?targetId=${encoded}&targetType=task`;
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
