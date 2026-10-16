import {
  isValidCalendarDateString,
  isValidIanaTimezone,
  getCalendarDateInTimezone,
} from './tasks.js';
import {
  type NoteDocument,
  createEmptyNoteDocument,
  calculateWordCount,
  calculateCharCount,
} from './notes.js';

export const MAX_JOURNAL_TITLE_LENGTH = 255;
export const MAX_JOURNAL_MOOD_LENGTH = 50;
export const MAX_JOURNAL_PROMPT_LENGTH = 500;
export const MAX_JOURNAL_RESPONSE_LENGTH = 5000;
export const MAX_JOURNAL_TAG_LENGTH = 64;

export interface JournalPromptItem {
  id?: string;
  prompt: string;
  response?: string;
}

export interface ReflectionTemplate {
  id: string;
  name: string;
  description: string;
  prompts: string[];
}

export const REFLECTION_TEMPLATES: ReflectionTemplate[] = [
  {
    id: 'blank',
    name: 'Blank Entry',
    description: 'Freeform writing with no structured prompts.',
    prompts: [],
  },
  {
    id: 'daily_reflection',
    name: 'Daily Reflection',
    description: 'Reflect gently on daily highlights, challenges, and gratitude.',
    prompts: [
      'What went well today?',
      'What was challenging or unexpected?',
      'What is one thing I feel grateful for?',
    ],
  },
  {
    id: 'evening_wind_down',
    name: 'Evening Wind-down',
    description: 'Release thoughts from the day and set calm rest intentions.',
    prompts: ['What can I let go of tonight?', 'What is one intention for tomorrow?'],
  },
  {
    id: 'clarity_check',
    name: 'Clarity Check',
    description: 'Clear mental clutter and identify key priorities.',
    prompts: [
      'What is currently taking up space in my mind?',
      'What is the single most important next step?',
    ],
  },
];

export function getReflectionTemplates(): ReflectionTemplate[] {
  return [...REFLECTION_TEMPLATES];
}

export function getReflectionTemplateById(id: string): ReflectionTemplate | null {
  return REFLECTION_TEMPLATES.find((t) => t.id === id) ?? null;
}

export function instantiateReflectionTemplate(templateId: string): JournalPromptItem[] {
  const template = getReflectionTemplateById(templateId);
  if (!template) {
    return [];
  }
  return template.prompts.map((p) => ({ prompt: p, response: '' }));
}

/**
 * Validates calendar date string YYYY-MM-DD.
 */
export function validateJournalEntryDate(dateStr: string): string {
  if (typeof dateStr !== 'string' || !isValidCalendarDateString(dateStr)) {
    throw new RangeError(`Invalid journal entry date: "${dateStr}". Expected YYYY-MM-DD format.`);
  }
  return dateStr;
}

/**
 * Validates IANA timezone name.
 */
export function validateJournalTimezone(tz: string): string {
  if (typeof tz !== 'string' || !isValidIanaTimezone(tz)) {
    throw new RangeError(`Invalid IANA timezone string: "${tz}".`);
  }
  return tz;
}

/**
 * Validates and trims journal title, preserving Unicode (including Bengali / non-Latin scripts).
 */
export function validateJournalTitle(title?: string | null): string | null {
  if (title === null || title === undefined) {
    return null;
  }
  if (typeof title !== 'string') {
    throw new TypeError('Journal title must be a string.');
  }
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > MAX_JOURNAL_TITLE_LENGTH) {
    throw new RangeError(
      `Journal title exceeds maximum allowed length of ${MAX_JOURNAL_TITLE_LENGTH} characters.`
    );
  }
  return trimmed;
}

/**
 * Validates optional mood label. Non-clinical: no forced numeric scoring or rigid scales.
 */
export function validateJournalMood(mood?: string | null): string | null {
  if (mood === null || mood === undefined) {
    return null;
  }
  if (typeof mood !== 'string') {
    throw new TypeError('Journal mood must be a string.');
  }
  const trimmed = mood.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > MAX_JOURNAL_MOOD_LENGTH) {
    throw new RangeError(
      `Journal mood exceeds maximum allowed length of ${MAX_JOURNAL_MOOD_LENGTH} characters.`
    );
  }
  return trimmed;
}

/**
 * Validates reflection prompts array.
 */
export function validateJournalPrompts(prompts?: unknown[]): JournalPromptItem[] {
  if (!prompts) return [];
  if (!Array.isArray(prompts)) {
    throw new TypeError('Journal prompts must be an array.');
  }
  return prompts.map((item, idx) => {
    if (!item || typeof item !== 'object') {
      throw new TypeError(`Journal prompt item at index ${idx} must be an object.`);
    }
    const p = item as Record<string, unknown>;
    if (typeof p['prompt'] !== 'string' || p['prompt'].trim().length === 0) {
      throw new RangeError(`Journal prompt at index ${idx} must contain non-empty prompt text.`);
    }
    if (p['prompt'].length > MAX_JOURNAL_PROMPT_LENGTH) {
      throw new RangeError(
        `Journal prompt at index ${idx} exceeds maximum length of ${MAX_JOURNAL_PROMPT_LENGTH} characters.`
      );
    }
    if (typeof p['response'] === 'string' && p['response'].length > MAX_JOURNAL_RESPONSE_LENGTH) {
      throw new RangeError(
        `Journal prompt response at index ${idx} exceeds maximum length of ${MAX_JOURNAL_RESPONSE_LENGTH} characters.`
      );
    }
    const response = typeof p['response'] === 'string' ? p['response'] : undefined;

    return {
      id: typeof p['id'] === 'string' ? p['id'] : undefined,
      prompt: p['prompt'].trim(),
      response,
    };
  });
}

/**
 * Computes word and character counts deterministically, supporting Unicode script and multiline content.
 */
export function computeJournalStats(plainText: string): { wordCount: number; charCount: number } {
  return {
    wordCount: calculateWordCount(plainText),
    charCount: calculateCharCount(plainText),
  };
}

/**
 * Validates journal tags.
 */
export function validateJournalTags(tags?: unknown[]): string[] {
  if (!tags) return [];
  if (!Array.isArray(tags)) {
    throw new TypeError('Journal tags must be an array.');
  }
  const sanitized: string[] = [];
  for (const tag of tags) {
    if (typeof tag === 'string') {
      const trimmed = tag.trim().toLowerCase();
      if (trimmed.length > 0 && trimmed.length <= MAX_JOURNAL_TAG_LENGTH) {
        if (!sanitized.includes(trimmed)) {
          sanitized.push(trimmed);
        }
      }
    }
  }
  return sanitized;
}

/**
 * Resolves an honest display title for a journal entry.
 * If title is absent and snippets are not suppressed, uses the first non-empty line of content text.
 * If snippets are suppressed or body is empty, falls back to neutral date title: "Journal entry - {entryDate}".
 */
export function resolveJournalTitle(
  title?: string | null,
  entryDate?: string,
  contentText?: string,
  options?: { suppressBodySnippet?: boolean }
): string {
  const validated = validateJournalTitle(title);
  if (validated) return validated;

  if (!options?.suppressBodySnippet && contentText && contentText.trim().length > 0) {
    const firstLine = contentText.trim().split(/\r?\n/)[0]!.trim();
    if (firstLine.length > 0) {
      return firstLine.slice(0, MAX_JOURNAL_TITLE_LENGTH);
    }
  }

  return entryDate ? `Journal entry - ${entryDate}` : 'Untitled Journal Entry';
}

/**
 * Evaluates whether an entry date is intentional backdating relative to creation instant.
 */
export function isEntryBackdated(
  entryDate: string,
  creationInstant: Date | string,
  timeZone: string
): boolean {
  const creationDate =
    typeof creationInstant === 'string' ? new Date(creationInstant) : creationInstant;
  const calendarDateAtCreation = getCalendarDateInTimezone(creationDate, timeZone);
  return entryDate < calendarDateAtCreation;
}

/**
 * Redacts sensitive journal preview text/snippets according to user privacy preferences.
 */
export function redactJournalPreview<
  T extends {
    title?: string | null;
    plainText: string;
    document?: NoteDocument;
    prompts?: JournalPromptItem[];
    mood?: string | null;
  },
>(entry: T, preferences?: { journalPreviewHidden?: boolean; suppressBodySnippets?: boolean }): T {
  const shouldHideBody = preferences?.suppressBodySnippets ?? true;
  if (!shouldHideBody) {
    return entry;
  }

  return {
    ...entry,
    plainText: '[Private journal entry]',
    document: createEmptyNoteDocument(),
    prompts: (entry.prompts || []).map((p) => ({ ...p, response: '[Redacted response]' })),
  };
}
