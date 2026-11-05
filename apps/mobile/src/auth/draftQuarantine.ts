/**
 * Mobile Draft Quarantine Manager
 *
 * Implements Daynori's cross-account data isolation and draft preservation policy:
 * - When an account signs out, is revoked, or switches users, uncommitted drafts
 *   are NEVER silently discarded.
 * - Uncommitted drafts are moved to quarantined storage tagged with the author's userId.
 * - Quarantined drafts belonging to User A are strictly inaccessible to User B.
 * - When User A logs back in, quarantined drafts are detected and offered for recovery.
 *
 * Phase 77: collection persists via OS-backed secure storage so process restart
 * recovers quarantined drafts. An in-memory array alone cannot establish restart recovery.
 */

import {
  defaultSecureStorage,
  type SecureStoreContract,
} from './secureStorage.js';

export interface QuarantinedDraft {
  id: string;
  userId: string;
  quarantinedAt: string;
  draftType: string;
  payload: Record<string, unknown>;
}

const QUARANTINE_SECURE_KEY = 'daynori_draft_quarantine_v1';

function isQuarantinedDraft(value: unknown): value is QuarantinedDraft {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.userId === 'string' &&
    typeof row.quarantinedAt === 'string' &&
    typeof row.draftType === 'string' &&
    row.payload !== null &&
    typeof row.payload === 'object'
  );
}

export class DraftQuarantineManager {
  private quarantined: QuarantinedDraft[] = [];
  private readonly store: SecureStoreContract | null;
  private hydratePromise: Promise<void> | null = null;
  private hydrated = false;

  constructor(opts?: { secureStore?: SecureStoreContract | null }) {
    if (opts && 'secureStore' in opts) {
      this.store = opts.secureStore ?? null;
    } else {
      this.store = defaultSecureStorage;
    }
  }

  /**
   * Loads durable quarantine entries from secure storage into memory.
   * Safe to call repeatedly; concurrent callers share one in-flight load.
   */
  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    if (this.hydratePromise) {
      await this.hydratePromise;
      return;
    }
    if (!this.store) {
      this.hydrated = true;
      return;
    }

    this.hydratePromise = (async () => {
      try {
        const raw = await this.store!.getItemAsync(QUARANTINE_SECURE_KEY);
        if (!raw) {
          this.quarantined = [];
          return;
        }
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
          this.quarantined = [];
          return;
        }
        this.quarantined = parsed.filter(isQuarantinedDraft);
      } catch {
        // Fail closed: keep existing memory contents; do not wipe other accounts' entries.
      } finally {
        this.hydrated = true;
        this.hydratePromise = null;
      }
    })();

    await this.hydratePromise;
  }

  private async persist(): Promise<void> {
    if (!this.store) return;
    try {
      await this.store.setItemAsync(QUARANTINE_SECURE_KEY, JSON.stringify(this.quarantined));
    } catch {
      // Propagation is handled by callers that await flush() during sign-out.
      throw new Error('Failed to persist draft quarantine to secure storage.');
    }
  }

  /** Awaitable flush for sign-out / restart-sensitive paths. */
  async flush(): Promise<void> {
    await this.persist();
  }

  quarantineDraft(
    userId: string,
    draftType: string,
    payload: Record<string, unknown>
  ): QuarantinedDraft {
    const draft: QuarantinedDraft = {
      id: `qd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      quarantinedAt: new Date().toISOString(),
      draftType,
      payload,
    };
    this.quarantined.push(draft);
    void this.persist().catch(() => undefined);
    return draft;
  }

  getQuarantinedDrafts(userId: string): QuarantinedDraft[] {
    if (!userId) return [];
    return this.quarantined.filter((d) => d.userId === userId);
  }

  restoreQuarantinedDraft(userId: string, draftId: string): Record<string, unknown> | null {
    if (!userId || !draftId) return null;
    const index = this.quarantined.findIndex((d) => d.id === draftId && d.userId === userId);
    if (index === -1) return null;
    const item = this.quarantined[index];
    this.quarantined.splice(index, 1);
    void this.persist().catch(() => undefined);
    return item ? item.payload : null;
  }

  dismissQuarantinedDraft(userId: string, draftId: string): boolean {
    if (!userId || !draftId) return false;
    const index = this.quarantined.findIndex((d) => d.id === draftId && d.userId === userId);
    if (index === -1) return false;
    this.quarantined.splice(index, 1);
    void this.persist().catch(() => undefined);
    return true;
  }

  clearUserQuarantines(userId: string): void {
    if (!userId) return;
    this.quarantined = this.quarantined.filter((d) => d.userId !== userId);
    void this.persist().catch(() => undefined);
  }

  clearAllQuarantines(): void {
    this.quarantined = [];
    void this.persist().catch(() => undefined);
  }
}

export const defaultDraftQuarantine = new DraftQuarantineManager();
