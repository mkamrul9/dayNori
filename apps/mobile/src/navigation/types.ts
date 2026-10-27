import type { ThemeMode } from '@daynori/design-tokens';
import type { MobileTab } from '@daynori/ui-mobile';

export type PlanSubView = 'tasks' | 'routines' | 'calendar';
export type LibraryFilter = 'all' | 'notes' | 'knowledge' | 'files';
export type ActiveModal =
  | 'none'
  | 'search'
  | 'create'
  | 'settings'
  | 'account'
  | 'gallery'
  | 'all-features'
  | 'onboarding'
  | 'onboarding-replay'
  | 'help-catalog'
  | 'sync-diagnostics'
  | 'recovery-export'
  | 'conflict-review'
  | 'workspace-portability'
  | 'account-deletion'
  | 'expenses'
  | 'audio-recorder'
  | 'custom-sections'
  /** Synthetic Phase 46 harness only — not a production vault enablement. */
  | 'vault-harness'
  /** Phase 49 provisional Drive connections — not production Google enablement. */
  | 'drive-connections'
  /** Phase 51 provisional shared rooms — not public invitation enablement. */
  | 'rooms'
  /** Phase 56 provisional assistant — not live/production AI enablement. */
  | 'assistant'
  /** Phase 57 provisional billing — not production purchase activation. */
  | 'billing';

export interface CreateDraft {
  type: 'task' | 'routine' | 'note' | 'journal' | 'file';
  title: string;
  details: string;
}

export interface MobileNavigationState {
  currentTab: MobileTab;
  planSubView: PlanSubView;
  libraryFilter: LibraryFilter;
  activeModal: ActiveModal;
  searchQuery: string;
  createDraft: CreateDraft;
  themeMode: ThemeMode;
  textScale: number;
  isAuthenticated: boolean;
  pendingProtectedDestination: string | null;
  feedbackMessage: string | null;
}
