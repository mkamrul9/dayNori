'use client';

import React from 'react';
import { SettingsPageChrome } from '../../../components/settings/SettingsPageChrome';
import { AppearanceSettingsSection } from '../../../components/settings/SettingsSections';
import { getSettingsGroup } from '../../../components/settings/settingsGroups';

export default function SettingsAppearancePage() {
  const group = getSettingsGroup('appearance');
  return (
    <SettingsPageChrome
      title={group?.title ?? 'Appearance and accessibility'}
      description={group?.description}
      backHref="/settings"
    >
      <AppearanceSettingsSection />
    </SettingsPageChrome>
  );
}
