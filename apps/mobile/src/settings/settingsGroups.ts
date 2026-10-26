/**
 * Native Settings groups — Phase 71 parity with web ADR 0070 / settingsGroups.
 */
export const MOBILE_SETTINGS_GROUPS = [
  {
    id: 'account',
    title: 'Account',
    description: 'Sign-in, workspace identity, and account deletion safeguards.',
    icon: 'user',
  },
  {
    id: 'appearance',
    title: 'Appearance and accessibility',
    description: 'Theme, text size, and readability preferences.',
    icon: 'sun',
  },
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'Reminder permission and quiet delivery preferences.',
    icon: 'bell',
  },
  {
    id: 'workspace',
    title: 'Workspace and visible features',
    description: 'Week start, expenses opt-in, and All features visibility.',
    icon: 'sliders',
  },
  {
    id: 'privacy',
    title: 'Privacy and data',
    description: 'Sync recovery, export, vault status, and data erasure links.',
    icon: 'lock',
  },
  {
    id: 'help',
    title: 'Help and feedback',
    description: 'Beginner guide replay and help entry points.',
    icon: 'help',
  },
] as const;

export type MobileSettingsGroupId = (typeof MOBILE_SETTINGS_GROUPS)[number]['id'];

export function getMobileSettingsGroup(id: MobileSettingsGroupId) {
  return MOBILE_SETTINGS_GROUPS.find((g) => g.id === id);
}

/** Operator overlays that return to Settings hub on Back (not shell). */
export const SETTINGS_NESTED_MODALS = new Set([
  'gallery',
  'vault-harness',
  'drive-connections',
  'rooms',
  'assistant',
  'billing',
  'expenses',
  'custom-sections',
  'sync-diagnostics',
  'recovery-export',
  'workspace-portability',
  'account-deletion',
  'all-features',
  'onboarding-replay',
  'account',
]);
