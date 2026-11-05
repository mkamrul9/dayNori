'use client';

import React from 'react';
import { SettingsPageChrome } from '../../../components/settings/SettingsPageChrome';
import { AccountSettingsSection } from '../../../components/settings/SettingsSections';
import { getSettingsGroup } from '../../../components/settings/settingsGroups';

export default function SettingsAccountPage() {
  const group = getSettingsGroup('account');
  return (
    <SettingsPageChrome
      title={group?.title ?? 'Account'}
      description={group?.description}
      backHref="/settings"
    >
      <AccountSettingsSection />
    </SettingsPageChrome>
  );
}
