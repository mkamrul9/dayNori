'use client';

import React from 'react';
import { SettingsPageChrome } from '../../../components/settings/SettingsPageChrome';
import { HelpSettingsSection } from '../../../components/settings/SettingsSections';
import { getSettingsGroup } from '../../../components/settings/settingsGroups';

export default function SettingsHelpPage() {
  const group = getSettingsGroup('help');
  return (
    <SettingsPageChrome
      title={group?.title ?? 'Help and feedback'}
      description={group?.description}
      backHref="/settings"
    >
      <HelpSettingsSection />
    </SettingsPageChrome>
  );
}
