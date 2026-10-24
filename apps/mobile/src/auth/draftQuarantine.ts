/**
 * Mobile Draft Quarantine Manager
 *
 * Implements Daynori's cross-account data isolation and draft preservation policy:
 * - When an account signs out, is revoked, or switches users, uncommitted drafts
 *   are NEVER silently discarded.
 * - Uncommitted drafts are moved to quarantined storage tagged with the author's userId.
 * - Quarantined drafts belonging to User A are strictly inaccessible to User B.
 * - When User A logs back in, quarantined drafts are detected and offered for recovery.
 */

export interface QuarantinedDraft {
  id: string;
  userId: string;
  quarantinedAt: string;
  draftType: string;
  payload: Record<string, unknown>;
}

export class DraftQuarantineManager {
  private quarantined: QuarantinedDraft[] = [];

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
    return item ? item.payload : null;
  }

  dismissQuarantinedDraft(userId: string, draftId: string): boolean {
    if (!userId || !draftId) return false;
    const index = this.quarantined.findIndex((d) => d.id === draftId && d.userId === userId);
    if (index === -1) return false;
    this.quarantined.splice(index, 1);
    return true;
  }

  clearUserQuarantines(userId: string): void {
    if (!userId) return;
    this.quarantined = this.quarantined.filter((d) => d.userId !== userId);
  }

  clearAllQuarantines(): void {
    this.quarantined = [];
  }
}

export const defaultDraftQuarantine = new DraftQuarantineManager();
