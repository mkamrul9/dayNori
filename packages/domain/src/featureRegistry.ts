/**
 * Phase 66 — Shared feature registry and eligibility.
 *
 * Axes stay separate:
 * A. Release capability for this environment/platform
 * B. Current actor authorization / membership
 * C. Personal visibility, pinning, and ordering
 *
 * Hiding is a preference only — never grants/revokes authorization or release.
 */

export const FEATURE_REGISTRY_VERSION = 1 as const;

export const FEATURE_IDS = [
  'today',
  'plan',
  'library',
  'journal',
  'search',
  'create',
  'all-features',
  'settings',
  'help',
  'support',
  'account',
  'tasks',
  'routines',
  'calendar',
  'notes',
  'files',
  'knowledge',
  'expenses',
  'custom-sections',
  'reminders',
  'vault',
  'drive',
  'rooms',
  'billing',
  'assistant',
  'developer-tools',
] as const;

export type FeatureId = (typeof FEATURE_IDS)[number];

export type FeaturePlatform = 'web' | 'installedPwa' | 'android' | 'iosNative';

export type ReleaseRequirement =
  'always' | 'core-organizer' | 'preview-optional' | 'gated-module' | 'operator-only';

export type AuthRequirement = 'public' | 'authenticated' | 'workspace-member' | 'platform-operator';

export interface FeatureDefinition {
  id: FeatureId;
  label: string;
  description: string;
  icon: string;
  category: 'primary' | 'utility' | 'module' | 'gated' | 'developer';
  /** Parent primary destination when nested (e.g. tasks → plan). */
  parentId?: FeatureId;
  webPath: string;
  mobileDestination: string;
  platforms: readonly FeaturePlatform[];
  releaseRequirement: ReleaseRequirement;
  authRequirement: AuthRequirement;
  /** May appear in primary shell tabs. */
  primaryNavigable: boolean;
  /** User may hide from shortcuts without losing content. */
  hideable: boolean;
  /** User may pin in secondary nav. */
  pinnable: boolean;
  /** Protected utilities — cannot be personalized away. */
  alwaysReachable: boolean;
  /** Include in All features directory as a navigable entry. */
  directoryEntry: boolean;
  createEligible?: boolean;
}

export const FEATURE_DEFINITIONS: readonly FeatureDefinition[] = [
  {
    id: 'today',
    label: 'Today',
    description: 'Immediate tasks, routines, and next actions.',
    icon: 'sun',
    category: 'primary',
    webPath: '/today',
    mobileDestination: 'today',
    platforms: ['web', 'installedPwa', 'android'],
    releaseRequirement: 'core-organizer',
    authRequirement: 'public',
    primaryNavigable: true,
    hideable: false,
    pinnable: false,
    alwaysReachable: true,
    directoryEntry: true,
  },
  {
    id: 'plan',
    label: 'Plan',
    description: 'Tasks, routines, and calendar.',
    icon: 'clipboard',
    category: 'primary',
    webPath: '/plan',
    mobileDestination: 'plan',
    platforms: ['web', 'installedPwa', 'android'],
    releaseRequirement: 'core-organizer',
    authRequirement: 'public',
    primaryNavigable: true,
    hideable: false,
    pinnable: false,
    alwaysReachable: true,
    directoryEntry: true,
  },
  {
    id: 'library',
    label: 'Library',
    description: 'Notes, folders, files, and saved material.',
    icon: 'library',
    category: 'primary',
    webPath: '/library',
    mobileDestination: 'library',
    platforms: ['web', 'installedPwa', 'android'],
    releaseRequirement: 'core-organizer',
    authRequirement: 'public',
    primaryNavigable: true,
    hideable: false,
    pinnable: false,
    alwaysReachable: true,
    directoryEntry: true,
  },
  {
    id: 'journal',
    label: 'Journal',
    description: 'Private dated writing.',
    icon: 'book',
    category: 'primary',
    webPath: '/journal',
    mobileDestination: 'journal',
    platforms: ['web', 'installedPwa', 'android'],
    releaseRequirement: 'core-organizer',
    authRequirement: 'authenticated',
    primaryNavigable: true,
    hideable: true,
    pinnable: true,
    alwaysReachable: false,
    directoryEntry: true,
  },
  {
    id: 'search',
    label: 'Search',
    description: 'Find authorized workspace content.',
    icon: 'search',
    category: 'utility',
    webPath: '/library',
    mobileDestination: 'search',
    platforms: ['web', 'installedPwa', 'android'],
    releaseRequirement: 'core-organizer',
    authRequirement: 'public',
    primaryNavigable: false,
    hideable: false,
    pinnable: false,
    alwaysReachable: true,
    directoryEntry: true,
  },
  {
    id: 'create',
    label: 'Create',
    description: 'Create notes, tasks, routines, and journal entries.',
    icon: 'plus',
    category: 'utility',
    webPath: '/today',
    mobileDestination: 'create',
    platforms: ['web', 'installedPwa', 'android'],
    releaseRequirement: 'core-organizer',
    authRequirement: 'public',
    primaryNavigable: false,
    hideable: false,
    pinnable: false,
    alwaysReachable: true,
    directoryEntry: true,
    createEligible: true,
  },
  {
    id: 'all-features',
    label: 'All features',
    description: 'Searchable directory of enabled features.',
    icon: 'sliders',
    category: 'utility',
    webPath: '/features',
    mobileDestination: 'all-features',
    platforms: ['web', 'installedPwa', 'android'],
    releaseRequirement: 'always',
    authRequirement: 'public',
    primaryNavigable: false,
    hideable: false,
    pinnable: false,
    alwaysReachable: true,
    directoryEntry: false,
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Appearance, accessibility, and account preferences.',
    icon: 'settings',
    category: 'utility',
    webPath: '/settings',
    mobileDestination: 'settings',
    platforms: ['web', 'installedPwa', 'android'],
    releaseRequirement: 'always',
    authRequirement: 'public',
    primaryNavigable: false,
    hideable: false,
    pinnable: false,
    alwaysReachable: true,
    directoryEntry: true,
  },
  {
    id: 'help',
    label: 'Help',
    description: 'How-tos and beginner guide.',
    icon: 'help',
    category: 'utility',
    webPath: '/help',
    mobileDestination: 'help',
    platforms: ['web', 'installedPwa', 'android'],
    releaseRequirement: 'always',
    authRequirement: 'public',
    primaryNavigable: false,
    hideable: false,
    pinnable: false,
    alwaysReachable: true,
    directoryEntry: true,
  },
  {
    id: 'support',
    label: 'Support',
    description: 'Contact and feedback entry points.',
    icon: 'user',
    category: 'utility',
    webPath: '/support',
    mobileDestination: 'support',
    platforms: ['web', 'installedPwa', 'android'],
    releaseRequirement: 'always',
    authRequirement: 'public',
    primaryNavigable: false,
    hideable: false,
    pinnable: false,
    alwaysReachable: true,
    directoryEntry: true,
  },
  {
    id: 'account',
    label: 'Account',
    description: 'Sign in, sign out, and account controls.',
    icon: 'user',
    category: 'utility',
    webPath: '/settings',
    mobileDestination: 'account',
    platforms: ['web', 'installedPwa', 'android'],
    releaseRequirement: 'always',
    authRequirement: 'public',
    primaryNavigable: false,
    hideable: false,
    pinnable: false,
    alwaysReachable: true,
    directoryEntry: true,
  },
  {
    id: 'tasks',
    label: 'Tasks',
    description: 'One-off tasks with deadlines.',
    icon: 'check-circle',
    category: 'module',
    parentId: 'plan',
    webPath: '/plan',
    mobileDestination: 'plan/tasks',
    platforms: ['web', 'installedPwa', 'android'],
    releaseRequirement: 'core-organizer',
    authRequirement: 'workspace-member',
    primaryNavigable: false,
    hideable: true,
    pinnable: true,
    alwaysReachable: false,
    directoryEntry: true,
    createEligible: true,
  },
  {
    id: 'routines',
    label: 'Routines',
    description: 'Recurring checklists.',
    icon: 'repeat',
    category: 'module',
    parentId: 'plan',
    webPath: '/plan',
    mobileDestination: 'plan/routines',
    platforms: ['web', 'installedPwa', 'android'],
    releaseRequirement: 'core-organizer',
    authRequirement: 'workspace-member',
    primaryNavigable: false,
    hideable: true,
    pinnable: true,
    alwaysReachable: false,
    directoryEntry: true,
    createEligible: true,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    description: 'Agenda and month projections.',
    icon: 'calendar',
    category: 'module',
    parentId: 'plan',
    webPath: '/plan/calendar',
    mobileDestination: 'plan/calendar',
    platforms: ['web', 'installedPwa', 'android'],
    releaseRequirement: 'core-organizer',
    authRequirement: 'workspace-member',
    primaryNavigable: false,
    hideable: true,
    pinnable: true,
    alwaysReachable: false,
    directoryEntry: true,
    createEligible: true,
  },
  {
    id: 'notes',
    label: 'Notes',
    description: 'Typed notes in Library.',
    icon: 'note',
    category: 'module',
    parentId: 'library',
    webPath: '/library',
    mobileDestination: 'library/notes',
    platforms: ['web', 'installedPwa', 'android'],
    releaseRequirement: 'core-organizer',
    authRequirement: 'workspace-member',
    primaryNavigable: false,
    hideable: true,
    pinnable: true,
    alwaysReachable: false,
    directoryEntry: true,
    createEligible: true,
  },
  {
    id: 'files',
    label: 'Files',
    description: 'Uploads and attachments.',
    icon: 'file',
    category: 'module',
    parentId: 'library',
    webPath: '/files',
    mobileDestination: 'library/files',
    platforms: ['web', 'installedPwa', 'android'],
    releaseRequirement: 'preview-optional',
    authRequirement: 'workspace-member',
    primaryNavigable: false,
    hideable: true,
    pinnable: true,
    alwaysReachable: false,
    directoryEntry: true,
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    description: 'Guides and saved views.',
    icon: 'bulb',
    category: 'module',
    parentId: 'library',
    webPath: '/library',
    mobileDestination: 'library',
    platforms: ['web', 'installedPwa', 'android'],
    releaseRequirement: 'core-organizer',
    authRequirement: 'workspace-member',
    primaryNavigable: false,
    hideable: true,
    pinnable: true,
    alwaysReachable: false,
    directoryEntry: true,
  },
  {
    id: 'expenses',
    label: 'Expenses',
    description: 'Expense tracking and budgets.',
    icon: 'wallet',
    category: 'module',
    webPath: '/expenses',
    mobileDestination: 'expenses',
    platforms: ['web', 'installedPwa', 'android'],
    releaseRequirement: 'preview-optional',
    authRequirement: 'workspace-member',
    primaryNavigable: false,
    hideable: true,
    pinnable: true,
    alwaysReachable: false,
    directoryEntry: true,
  },
  {
    id: 'custom-sections',
    label: 'Custom sections',
    description: 'Approved block compositions.',
    icon: 'clipboard',
    category: 'module',
    webPath: '/custom-sections',
    mobileDestination: 'custom-sections',
    platforms: ['web', 'installedPwa', 'android'],
    releaseRequirement: 'preview-optional',
    authRequirement: 'workspace-member',
    primaryNavigable: false,
    hideable: true,
    pinnable: true,
    alwaysReachable: false,
    directoryEntry: true,
  },
  {
    id: 'reminders',
    label: 'Reminders',
    description: 'Scheduled notifications.',
    icon: 'bell',
    category: 'module',
    webPath: '/settings',
    mobileDestination: 'settings',
    platforms: ['web', 'installedPwa', 'android'],
    releaseRequirement: 'preview-optional',
    authRequirement: 'workspace-member',
    primaryNavigable: false,
    hideable: true,
    pinnable: false,
    alwaysReachable: false,
    directoryEntry: true,
  },
  {
    id: 'vault',
    label: 'Vault',
    description: 'Encrypted storage (gated).',
    icon: 'lock',
    category: 'gated',
    webPath: '/vault',
    mobileDestination: 'vault',
    platforms: ['web', 'installedPwa', 'android'],
    releaseRequirement: 'gated-module',
    authRequirement: 'workspace-member',
    primaryNavigable: false,
    hideable: false,
    pinnable: false,
    alwaysReachable: false,
    directoryEntry: true,
  },
  {
    id: 'drive',
    label: 'Google Drive',
    description: 'Optional Drive connector (gated).',
    icon: 'cloud',
    category: 'gated',
    webPath: '/settings',
    mobileDestination: 'drive',
    platforms: ['web', 'installedPwa', 'android'],
    releaseRequirement: 'gated-module',
    authRequirement: 'workspace-member',
    primaryNavigable: false,
    hideable: false,
    pinnable: false,
    alwaysReachable: false,
    directoryEntry: true,
  },
  {
    id: 'rooms',
    label: 'Rooms & chat',
    description: 'Shared rooms (gated).',
    icon: 'user',
    category: 'gated',
    webPath: '/settings',
    mobileDestination: 'rooms',
    platforms: ['web', 'installedPwa', 'android'],
    releaseRequirement: 'gated-module',
    authRequirement: 'workspace-member',
    primaryNavigable: false,
    hideable: false,
    pinnable: false,
    alwaysReachable: false,
    directoryEntry: true,
  },
  {
    id: 'billing',
    label: 'Billing',
    description: 'Plans and entitlements (gated).',
    icon: 'credit-card',
    category: 'gated',
    webPath: '/settings',
    mobileDestination: 'billing',
    platforms: ['web', 'installedPwa', 'android'],
    releaseRequirement: 'gated-module',
    authRequirement: 'workspace-member',
    primaryNavigable: false,
    hideable: false,
    pinnable: false,
    alwaysReachable: false,
    directoryEntry: true,
  },
  {
    id: 'assistant',
    label: 'Assistant',
    description: 'Optional AI assistant (gated).',
    icon: 'bulb',
    category: 'gated',
    webPath: '/settings',
    mobileDestination: 'assistant',
    platforms: ['web', 'installedPwa', 'android'],
    releaseRequirement: 'gated-module',
    authRequirement: 'workspace-member',
    primaryNavigable: false,
    hideable: false,
    pinnable: false,
    alwaysReachable: false,
    directoryEntry: true,
  },
  {
    id: 'developer-tools',
    label: 'Developer tools',
    description: 'Restricted operator diagnostics and harnesses.',
    icon: 'code',
    category: 'developer',
    webPath: '/developer',
    mobileDestination: 'developer',
    platforms: ['web', 'installedPwa', 'android'],
    releaseRequirement: 'operator-only',
    authRequirement: 'platform-operator',
    primaryNavigable: false,
    hideable: false,
    pinnable: false,
    alwaysReachable: false,
    directoryEntry: false,
  },
] as const;

const FEATURE_BY_ID: ReadonlyMap<FeatureId, FeatureDefinition> = new Map(
  FEATURE_DEFINITIONS.map((f) => [f.id, f])
);

export function getFeatureDefinition(id: string): FeatureDefinition | undefined {
  if (!FEATURE_IDS.includes(id as FeatureId)) return undefined;
  return FEATURE_BY_ID.get(id as FeatureId);
}

export function assertKnownFeatureIds(ids: readonly string[]): FeatureId[] {
  const out: FeatureId[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== 'string' || seen.has(id)) continue;
    if (!FEATURE_IDS.includes(id as FeatureId)) continue;
    seen.add(id);
    out.push(id as FeatureId);
  }
  return out;
}

export interface FeatureReleaseContext {
  platform: FeaturePlatform;
  /** Hosted/core preview disables some optional modules. */
  corePreview: boolean;
  /** Production NODE_ENV closes local harness flags for gated modules. */
  production: boolean;
  /** Explicit module release switches (never from preferences). */
  moduleReleased: Partial<Record<FeatureId, boolean>>;
  /** Unknown capability state fails closed. */
  capabilityKnown: boolean;
}

export interface FeatureAuthContext {
  authenticated: boolean;
  hasWorkspaceMembership: boolean;
  isPlatformOperator: boolean;
  /** Unknown privilege fails closed. */
  privilegeKnown: boolean;
}

export interface FeaturePersonalization {
  version: typeof FEATURE_REGISTRY_VERSION;
  hiddenFeatureIds: FeatureId[];
  pinnedFeatureIds: FeatureId[];
}

export type EligibilityReason =
  | 'ok'
  | 'unknown-feature'
  | 'platform-unsupported'
  | 'capability-unknown'
  | 'not-released'
  | 'preview-unavailable'
  | 'auth-required'
  | 'workspace-required'
  | 'operator-required'
  | 'privilege-unknown'
  | 'personally-hidden';

export interface FeatureEligibility {
  featureId: FeatureId | string;
  usable: boolean;
  showInDirectory: boolean;
  showInPrimaryNav: boolean;
  canPin: boolean;
  canHide: boolean;
  personallyHidden: boolean;
  releaseOk: boolean;
  authOk: boolean;
  reason: EligibilityReason;
  statusLabel?: string;
}

export function isReleaseSatisfied(
  feature: FeatureDefinition,
  release: FeatureReleaseContext
): { ok: boolean; reason: EligibilityReason; statusLabel?: string } {
  if (!release.capabilityKnown) {
    return { ok: false, reason: 'capability-unknown', statusLabel: 'Availability unknown' };
  }
  if (!feature.platforms.includes(release.platform)) {
    return { ok: false, reason: 'platform-unsupported', statusLabel: 'Not on this platform' };
  }
  switch (feature.releaseRequirement) {
    case 'always':
    case 'core-organizer':
      return { ok: true, reason: 'ok' };
    case 'preview-optional':
      if (release.corePreview && feature.id !== 'expenses' && feature.id !== 'custom-sections') {
        // Files/audio/reminders off in core preview; expenses/custom sections may still exist locally.
        if (feature.id === 'files' || feature.id === 'reminders') {
          return {
            ok: false,
            reason: 'preview-unavailable',
            statusLabel: 'Unavailable in this testing preview',
          };
        }
      }
      return { ok: true, reason: 'ok' };
    case 'gated-module': {
      const released = release.moduleReleased[feature.id] === true;
      if (!released) {
        return {
          ok: false,
          reason: 'not-released',
          statusLabel: 'Not released yet',
        };
      }
      // Even if marked released in config, production never enables via local-only flags alone —
      // callers must set moduleReleased only when real gates pass.
      if (release.production && release.moduleReleased[feature.id] !== true) {
        return { ok: false, reason: 'not-released', statusLabel: 'Not released yet' };
      }
      return { ok: true, reason: 'ok' };
    }
    case 'operator-only':
      return { ok: true, reason: 'ok' };
    default:
      return { ok: false, reason: 'capability-unknown', statusLabel: 'Availability unknown' };
  }
}

export function isAuthSatisfied(
  feature: FeatureDefinition,
  auth: FeatureAuthContext
): { ok: boolean; reason: EligibilityReason; statusLabel?: string } {
  if (!auth.privilegeKnown && feature.authRequirement === 'platform-operator') {
    return { ok: false, reason: 'privilege-unknown', statusLabel: 'Access unknown' };
  }
  switch (feature.authRequirement) {
    case 'public':
      return { ok: true, reason: 'ok' };
    case 'authenticated':
      if (!auth.authenticated) {
        return { ok: false, reason: 'auth-required', statusLabel: 'Sign in required' };
      }
      return { ok: true, reason: 'ok' };
    case 'workspace-member':
      if (!auth.authenticated) {
        return { ok: false, reason: 'auth-required', statusLabel: 'Sign in required' };
      }
      if (!auth.hasWorkspaceMembership) {
        return { ok: false, reason: 'workspace-required', statusLabel: 'Workspace required' };
      }
      return { ok: true, reason: 'ok' };
    case 'platform-operator':
      if (!auth.isPlatformOperator) {
        return { ok: false, reason: 'operator-required', statusLabel: 'Operator access required' };
      }
      return { ok: true, reason: 'ok' };
    default:
      return { ok: false, reason: 'privilege-unknown', statusLabel: 'Access unknown' };
  }
}

export function evaluateFeatureEligibility(
  featureId: string,
  release: FeatureReleaseContext,
  auth: FeatureAuthContext,
  personal: FeaturePersonalization | null | undefined
): FeatureEligibility {
  const feature = getFeatureDefinition(featureId);
  if (!feature) {
    return {
      featureId,
      usable: false,
      showInDirectory: false,
      showInPrimaryNav: false,
      canPin: false,
      canHide: false,
      personallyHidden: false,
      releaseOk: false,
      authOk: false,
      reason: 'unknown-feature',
      statusLabel: 'Unknown feature',
    };
  }

  const releaseResult = isReleaseSatisfied(feature, release);
  const authResult = isAuthSatisfied(feature, auth);
  const hiddenIds = personal?.hiddenFeatureIds ?? [];
  const personallyHidden = feature.hideable && hiddenIds.includes(feature.id);

  const usable = releaseResult.ok && authResult.ok && !personallyHidden;
  const reason: EligibilityReason = !releaseResult.ok
    ? releaseResult.reason
    : !authResult.ok
      ? authResult.reason
      : personallyHidden
        ? 'personally-hidden'
        : 'ok';

  return {
    featureId: feature.id,
    usable,
    showInDirectory:
      feature.directoryEntry &&
      releaseResult.ok &&
      authResult.ok &&
      feature.category !== 'developer',
    showInPrimaryNav:
      feature.primaryNavigable && releaseResult.ok && authResult.ok && !personallyHidden,
    canPin: feature.pinnable && releaseResult.ok && authResult.ok,
    canHide: feature.hideable && releaseResult.ok && authResult.ok,
    personallyHidden,
    releaseOk: releaseResult.ok,
    authOk: authResult.ok,
    reason,
    statusLabel: releaseResult.statusLabel ?? authResult.statusLabel,
  };
}

export function getDefaultFeaturePersonalization(): FeaturePersonalization {
  return {
    version: FEATURE_REGISTRY_VERSION,
    hiddenFeatureIds: [],
    pinnedFeatureIds: [],
  };
}

/**
 * Migrate personalization from existing homeLayout.moduleShortcuts and prior prefs.
 * Deterministic, idempotent; drops unknown IDs; never invents developer privileges.
 */
export function sanitizeAndMigrateFeaturePersonalization(
  input: unknown,
  legacyModuleShortcuts?: Array<{ id: string; visible: boolean; order: number }> | null
): FeaturePersonalization {
  const hidden = new Set<FeatureId>();
  const pinned: FeatureId[] = [];
  const pinnedSeen = new Set<string>();

  if (legacyModuleShortcuts && Array.isArray(legacyModuleShortcuts)) {
    for (const shortcut of legacyModuleShortcuts) {
      if (!shortcut || typeof shortcut !== 'object') continue;
      const id = shortcut.id;
      const def = getFeatureDefinition(id);
      if (!def || !def.hideable) continue;
      if (shortcut.visible === false) hidden.add(def.id);
    }
  }

  if (input && typeof input === 'object') {
    const raw = input as Record<string, unknown>;
    const rawHidden = Array.isArray(raw.hiddenFeatureIds) ? raw.hiddenFeatureIds : [];
    for (const id of assertKnownFeatureIds(rawHidden.map(String))) {
      const def = getFeatureDefinition(id);
      if (def?.hideable) hidden.add(id);
    }
    const rawPinned = Array.isArray(raw.pinnedFeatureIds) ? raw.pinnedFeatureIds : [];
    for (const id of assertKnownFeatureIds(rawPinned.map(String))) {
      const def = getFeatureDefinition(id);
      if (!def?.pinnable || pinnedSeen.has(id)) continue;
      // Cannot pin a permanently non-hideable primary utility conflict — still allow pinnable modules.
      pinnedSeen.add(id);
      pinned.push(id);
    }
  }

  // Pinned items that are hidden stay pinned but not shown until restored.
  return {
    version: FEATURE_REGISTRY_VERSION,
    hiddenFeatureIds: [...hidden].sort(),
    pinnedFeatureIds: pinned,
  };
}

export function listPrimaryShellTabs(
  release: FeatureReleaseContext,
  auth: FeatureAuthContext,
  personal: FeaturePersonalization | null | undefined
): FeatureDefinition[] {
  const defaults: FeatureId[] = ['today', 'plan', 'library', 'journal'];
  const tabs: FeatureDefinition[] = [];
  for (const id of defaults) {
    const elig = evaluateFeatureEligibility(id, release, auth, personal);
    if (!elig.showInPrimaryNav) continue;
    const def = getFeatureDefinition(id);
    if (def) tabs.push(def);
  }
  // ADR: hiding Journal leaves three primary tabs; do not invent a fifth competing destination.
  return tabs;
}

export function listPinnedFeatures(
  release: FeatureReleaseContext,
  auth: FeatureAuthContext,
  personal: FeaturePersonalization | null | undefined
): FeatureDefinition[] {
  const pins = personal?.pinnedFeatureIds ?? [];
  const out: FeatureDefinition[] = [];
  for (const id of pins) {
    const elig = evaluateFeatureEligibility(id, release, auth, personal);
    if (!elig.usable && elig.reason === 'personally-hidden') continue;
    if (!elig.canPin && !elig.usable) continue;
    if (!elig.releaseOk || !elig.authOk) continue;
    if (elig.personallyHidden) continue;
    const def = getFeatureDefinition(id);
    // Avoid duplicating primary tabs in pin strip.
    if (def && !def.primaryNavigable) out.push(def);
    else if (
      def &&
      def.id === 'journal' &&
      !listPrimaryShellTabs(release, auth, personal).some((t) => t.id === 'journal')
    ) {
      out.push(def);
    }
  }
  return out;
}

export function searchFeatureDirectory(
  query: string,
  release: FeatureReleaseContext,
  auth: FeatureAuthContext,
  personal: FeaturePersonalization | null | undefined,
  options?: { includeHiddenForRestore?: boolean }
): Array<{ feature: FeatureDefinition; eligibility: FeatureEligibility }> {
  const q = query.trim().toLowerCase();
  const results: Array<{ feature: FeatureDefinition; eligibility: FeatureEligibility }> = [];
  for (const feature of FEATURE_DEFINITIONS) {
    if (!feature.directoryEntry && feature.id !== 'developer-tools') continue;
    if (feature.category === 'developer' && !auth.isPlatformOperator) continue;
    const eligibility = evaluateFeatureEligibility(feature.id, release, auth, personal);
    if (!eligibility.releaseOk || !eligibility.authOk) {
      // Still show gated modules as unavailable status entries when released axis fails.
      if (feature.category === 'gated' && eligibility.reason === 'not-released') {
        if (
          !q ||
          feature.label.toLowerCase().includes(q) ||
          feature.description.toLowerCase().includes(q)
        ) {
          results.push({ feature, eligibility });
        }
      }
      continue;
    }
    if (eligibility.personallyHidden && !options?.includeHiddenForRestore) continue;
    if (eligibility.personallyHidden && options?.includeHiddenForRestore) {
      // Include for restore.
    } else if (!eligibility.showInDirectory && !eligibility.personallyHidden) {
      continue;
    }
    if (
      q &&
      !feature.label.toLowerCase().includes(q) &&
      !feature.description.toLowerCase().includes(q) &&
      !feature.id.includes(q)
    ) {
      continue;
    }
    results.push({ feature, eligibility });
  }
  return results;
}

/** Two-action reachability: shell control → All features → destination counts as two. */
export function describeTwoActionPath(featureId: FeatureId): string {
  const feature = getFeatureDefinition(featureId);
  if (!feature) return 'unknown';
  if (feature.primaryNavigable || feature.alwaysReachable) {
    return `shell → ${feature.label}`;
  }
  return `shell → All features → ${feature.label}`;
}
