/**
 * Stable Settings routes for Phase 70 grouped subpages.
 * Hub: /settings — subpages below remain bookmarkable deep links.
 */
export const SETTINGS_GROUPS = [
  {
    id: 'account',
    href: '/settings/account',
    title: 'Account',
    description: 'Sign-in, workspace identity, and account deletion safeguards.',
    icon: 'user' as const,
  },
  {
    id: 'appearance',
    href: '/settings/appearance',
    title: 'Appearance and accessibility',
    description: 'Theme, text size, language, direction, and keyboard shortcuts.',
    icon: 'sun' as const,
  },
  {
    id: 'notifications',
    href: '/settings/notifications',
    title: 'Notifications',
    description: 'Reminder agenda, quiet hours, and browser notification capability.',
    icon: 'bell' as const,
  },
  {
    id: 'workspace',
    href: '/settings/workspace',
    title: 'Workspace and visible features',
    description: 'Time zone, week start, compact mode, and feature visibility.',
    icon: 'sliders' as const,
  },
  {
    id: 'privacy',
    href: '/settings/privacy',
    title: 'Privacy and data',
    description: 'Journal preview privacy, sync recovery, export, and vault status.',
    icon: 'lock' as const,
  },
  {
    id: 'help',
    href: '/settings/help',
    title: 'Help and feedback',
    description: 'Beginner guide replay, Help, and support entry points.',
    icon: 'help' as const,
  },
] as const;

export type SettingsGroupId = (typeof SETTINGS_GROUPS)[number]['id'];

export function getSettingsGroup(id: SettingsGroupId) {
  return SETTINGS_GROUPS.find((g) => g.id === id);
}
