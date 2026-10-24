/**
 * Document-level unsaved-work signal for safe PWA updates.
 * Editors set this while the user has local edits not yet durably queued.
 * Does not store content — only a boolean presence flag.
 */

const ATTR = 'data-daynori-unsaved';
const EVENT = 'daynori:unsaved-change';

export function setUnsavedWork(active: boolean): void {
  if (typeof document === 'undefined') return;
  if (active) {
    document.documentElement.setAttribute(ATTR, 'true');
  } else {
    document.documentElement.removeAttribute(ATTR);
  }
  document.dispatchEvent(new CustomEvent(EVENT, { detail: { active } }));
}

export function hasUnsavedWork(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.getAttribute(ATTR) === 'true';
}

export function subscribeUnsavedWork(listener: (active: boolean) => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ active: boolean }>).detail;
    listener(Boolean(detail?.active));
  };
  document.addEventListener(EVENT, handler);
  return () => document.removeEventListener(EVENT, handler);
}
