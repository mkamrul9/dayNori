'use client';

import React from 'react';
import { SettingsPageChrome } from '../../../components/settings/SettingsPageChrome';
import { WorkspaceSettingsSection } from '../../../components/settings/SettingsSections';
import { getSettingsGroup } from '../../../components/settings/settingsGroups';

export default function SettingsWorkspacePage() {
  const group = getSettingsGroup('workspace');
  return (
    <SettingsPageChrome
      title={group?.title ?? 'Workspace and visible features'}
      description={group?.description}
      backHref="/settings"
    >
      <WorkspaceSettingsSection />
    </SettingsPageChrome>
  );
}
