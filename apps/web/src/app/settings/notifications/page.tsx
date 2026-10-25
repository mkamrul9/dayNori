'use client';

import React from 'react';
import { SettingsPageChrome } from '../../../components/settings/SettingsPageChrome';
import { NotificationsSettingsSection } from '../../../components/settings/SettingsSections';
import { getSettingsGroup } from '../../../components/settings/settingsGroups';

export default function SettingsNotificationsPage() {
  const group = getSettingsGroup('notifications');
  return (
    <SettingsPageChrome
      title={group?.title ?? 'Notifications'}
      description={group?.description}
      backHref="/settings"
    >
      <NotificationsSettingsSection />
    </SettingsPageChrome>
  );
}
