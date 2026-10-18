import type { HomeLayout, ModuleShortcutConfig, ModuleShortcutId } from './home.js';
import { sha256Sync } from './crypto.js';

export type OnboardingInterest = 'notes' | 'planning' | 'journal' | 'files';
export type OnboardingStep = 'capture' | 'planning' | 'organize' | 'completed';

export interface OnboardingState {
  version: 1;
  step: OnboardingStep;
  completed: boolean;
  completedAt?: string | null;
  skipped: boolean;
  skippedAt?: string | null;
  selectedInterests: OnboardingInterest[];
  createdSampleItemIds: string[];
  createdFolderId?: string | null;
}

export const TUTORIAL_STEPS: OnboardingStep[] = ['capture', 'planning', 'organize'];

export const ONBOARDING_STEP_METADATA: Record<
  OnboardingStep,
  {
    stepIndex: number;
    totalSteps: number;
    title: string;
    description: string;
    announcement: string;
  }
> = {
  capture: {
    stepIndex: 1,
    totalSteps: 3,
    title: 'Capture anything',
    description:
      'Jot down thoughts, tasks, and ideas the moment they happen. Notes are flexible documents that keep your ideas safe.',
    announcement: 'Step 1 of 3: Capture anything. Learn how to capture thoughts, tasks, and notes quickly.',
  },
  planning: {
    stepIndex: 2,
    totalSteps: 3,
    title: 'Plan tasks and routines',
    description:
      'Separate one-off tasks with deadlines from daily routines that repeat. Today shows today’s scheduled routines and urgent tasks without clutter.',
    announcement: 'Step 2 of 3: Plan tasks and routines. Understand one-off tasks versus daily routines.',
  },
  organize: {
    stepIndex: 3,
    totalSteps: 3,
    title: 'Organize folders and personalize Today',
    description:
      'Keep files, notes, and tasks neatly grouped in folders, and customize your Today dashboard with widgets and shortcuts that fit your rhythm.',
    announcement: 'Step 3 of 3: Organize folders and personalize Today. Setup folders and customize shortcuts.',
  },
  completed: {
    stepIndex: 3,
    totalSteps: 3,
    title: 'Tutorial completed',
    description: 'You are ready to explore your personalized Daynori workspace.',
    announcement: 'Tutorial completed. Navigating to your personalized Today home.',
  },
};

export const ONBOARDING_INTEREST_LABELS: Record<
  OnboardingInterest,
  { label: string; icon: string; description: string }
> = {
  notes: {
    label: 'Notes & Writing',
    icon: '📝',
    description: 'Rich notes, quick thoughts, and reference material',
  },
  planning: {
    label: 'Planning & Tasks',
    icon: '✓',
    description: 'Deadlines, checklists, and daily repeating routines',
  },
  journal: {
    label: 'Reflective Journal',
    icon: '📖',
    description: 'Private daily reflections, gratitude, and retrospectives',
  },
  files: {
    label: 'Organized Files',
    icon: '📁',
    description: 'PDFs, documents, and attachments in authorized folders',
  },
};

/**
 * Returns default initial onboarding state for a new account.
 */
export function getDefaultOnboardingState(): OnboardingState {
  return {
    version: 1,
    step: 'capture',
    completed: false,
    completedAt: null,
    skipped: false,
    skippedAt: null,
    selectedInterests: ['notes', 'planning', 'journal', 'files'],
    createdSampleItemIds: [],
    createdFolderId: null,
  };
}

/**
 * Determines whether the onboarding tutorial should be displayed for the user.
 * Returns true if the user has neither completed nor skipped the tutorial.
 */
export function shouldShowOnboarding(onboarding?: OnboardingState | null): boolean {
  if (!onboarding) return true;
  return !onboarding.completed && !onboarding.skipped;
}

/**
 * Transitions onboarding to the next step, ensuring valid progression.
 */
export function advanceOnboardingStep(
  current: OnboardingState,
  nextStep: OnboardingStep
): OnboardingState {
  return {
    ...current,
    step: nextStep,
  };
}

/**
 * Marks onboarding as completed with timestamp.
 */
export function completeOnboarding(
  current: OnboardingState,
  completedAt: string = new Date().toISOString()
): OnboardingState {
  return {
    ...current,
    step: 'completed',
    completed: true,
    completedAt,
    skipped: false,
  };
}

/**
 * Marks onboarding as skipped with timestamp.
 */
export function skipOnboarding(
  current: OnboardingState,
  skippedAt: string = new Date().toISOString()
): OnboardingState {
  return {
    ...current,
    step: 'completed',
    skipped: true,
    skippedAt,
    completed: false,
  };
}

/**
 * Resets onboarding state for replay from Settings or Help.
 * Crucial invariant: preserves createdSampleItemIds and createdFolderId so replay
 * NEVER duplicates created items or wipes prior workspace content.
 */
export function resetOnboardingForReplay(current: OnboardingState): OnboardingState {
  return {
    ...current,
    step: 'capture',
    completed: false,
    completedAt: null,
    skipped: false,
    skippedAt: null,
  };
}

/**
 * Configures visible module shortcuts according to selected interests.
 * Crucial invariant: configuring interests updates presentation visibility only;
 * it does not alter permissions, revoke authorization, or delete existing records.
 */
export function deriveModuleShortcutsFromInterests(
  interests: OnboardingInterest[],
  currentLayout: HomeLayout
): HomeLayout {
  const interestSet = new Set(interests);

  const shouldBeVisible = (id: ModuleShortcutId): boolean => {
    switch (id) {
      case 'today':
        return true; // Today is always visible
      case 'notes':
      case 'library':
        return interestSet.has('notes') || interestSet.has('files');
      case 'plan':
      case 'tasks':
      case 'routines':
      case 'calendar':
        return interestSet.has('planning');
      case 'journal':
        return interestSet.has('journal');
      case 'files':
        return interestSet.has('files');
      case 'knowledge':
        return false; // unreleased module remains gated
      default:
        return false;
    }
  };

  const updatedShortcuts: ModuleShortcutConfig[] = currentLayout.moduleShortcuts.map((s) => ({
    ...s,
    visible: shouldBeVisible(s.id),
  }));

  return {
    ...currentLayout,
    moduleShortcuts: updatedShortcuts,
  };
}

/**
 * Deterministically derives an RFC 4122 v5-compliant UUID from a namespace and name.
 * Guarantees mathematical idempotency across retries, reloads, and multi-device sync.
 */
export function createDeterministicUuid(namespace: string, name: string): string {
  const enc = new TextEncoder();
  const hex = sha256Sync(enc.encode(`${namespace}:${name}`));
  const p1 = hex.slice(0, 8);
  const p2 = hex.slice(8, 12);
  const p3 = '5' + hex.slice(13, 16);
  const p4 = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') + hex.slice(18, 20);
  const p5 = hex.slice(20, 32);
  return `${p1}-${p2}-${p3}-${p4}-${p5}`.toLowerCase();
}

export function getSampleFolderId(workspaceId: string, userId: string): string {
  return createDeterministicUuid('daynori-sample-folder', `${workspaceId}:${userId}`);
}

export function getSampleNoteId(workspaceId: string, userId: string): string {
  return createDeterministicUuid('daynori-sample-note', `${workspaceId}:${userId}`);
}

export function getSampleTaskId(workspaceId: string, userId: string): string {
  return createDeterministicUuid('daynori-sample-task', `${workspaceId}:${userId}`);
}

export interface SampleItemTemplate {
  folderName: string;
  noteTitle: string;
  noteSnippet: string;
  taskTitle: string;
}

export const SAMPLE_STARTER_TEMPLATE: SampleItemTemplate = {
  folderName: 'Personal Starter',
  noteTitle: 'Welcome to Daynori (Sample)',
  noteSnippet:
    'Welcome to your personal workspace! This opt-in sample note demonstrates capturing ideas and notes. You can edit, move to another folder, or delete this note at any time.',
  taskTitle: 'Explore your Daynori Today dashboard (Sample)',
};
