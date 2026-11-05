/**
 * Preserve editor return context when opening contextual Help (Phase 78).
 * Does not store private note/journal bodies — only route/focus metadata + account scope.
 */

export interface HelpReturnContext {
  userId: string;
  workspaceId: string | null;
  returnPath: string;
  focusSelector?: string;
  articleId: string;
  openedAt: string;
}

const STORAGE_KEY = 'daynori_help_return_context_v1';

export function saveHelpReturnContext(ctx: HelpReturnContext): void {
  if (typeof sessionStorage === 'undefined') return;
  if (!ctx.userId || !ctx.articleId) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
  } catch {
    /* ignore quota */
  }
}

export function readHelpReturnContext(expectedUserId?: string | null): HelpReturnContext | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HelpReturnContext;
    if (!parsed?.userId || !parsed.articleId || !parsed.returnPath) return null;
    if (expectedUserId && parsed.userId !== expectedUserId) {
      // Never restore another account's return context.
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearHelpReturnContext(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

const LEARN_KEY_PREFIX = 'daynori_help_continue_learning_v1:';

export function saveContinueLearning(userId: string, chapterId: string): void {
  if (typeof localStorage === 'undefined' || !userId || !chapterId) return;
  try {
    localStorage.setItem(
      LEARN_KEY_PREFIX + userId,
      JSON.stringify({ chapterId, updatedAt: new Date().toISOString() })
    );
  } catch {
    /* ignore */
  }
}

export function readContinueLearning(userId: string | null | undefined): string | null {
  if (typeof localStorage === 'undefined' || !userId) return null;
  try {
    const raw = localStorage.getItem(LEARN_KEY_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { chapterId?: string };
    return typeof parsed.chapterId === 'string' ? parsed.chapterId : null;
  } catch {
    return null;
  }
}

export function clearContinueLearning(userId: string): void {
  if (typeof localStorage === 'undefined' || !userId) return;
  try {
    localStorage.removeItem(LEARN_KEY_PREFIX + userId);
  } catch {
    /* ignore */
  }
}
