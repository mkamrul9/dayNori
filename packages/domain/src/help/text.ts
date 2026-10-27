import type { LocalizedText } from './types.js';

/** Build a localization-ready string with English default. */
export function L(key: string, defaultText: string): LocalizedText {
  return { key, defaultText };
}

export function resolveHelpText(text: LocalizedText): string {
  return text.defaultText;
}
