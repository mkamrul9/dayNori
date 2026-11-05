'use client';

import React from 'react';
import { SettingsPageChrome } from '../../../components/settings/SettingsPageChrome';
import { PrivacySettingsSection } from '../../../components/settings/SettingsSections';
import { getSettingsGroup } from '../../../components/settings/settingsGroups';

export default function SettingsPrivacyPage() {
  const group = getSettingsGroup('privacy');
  return (
    <SettingsPageChrome
      title={group?.title ?? 'Privacy and data'}
      description={group?.description}
      backHref="/settings"
    >
      <PrivacySettingsSection />
    </SettingsPageChrome>
  );
}
