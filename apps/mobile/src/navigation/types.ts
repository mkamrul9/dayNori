import type { ThemeMode } from '@daynori/design-tokens';
import type { MobileTab } from '@daynori/ui-mobile';

export type PlanSubView = 'tasks' | 'routines' | 'calendar';
export type LibraryFilter = 'all' | 'notes' | 'knowledge' | 'files';
export type ActiveModal = 'none' | 'search' | 'create' | 'settings' | 'gallery' | 'onboarding';

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
