'use client';

import React from 'react';
import Link from 'next/link';
import { colors, spacing, typography } from '@daynori/design-tokens';
import { Button, Card, Feedback } from '@daynori/ui-web';
import { useShell } from '../../components/ShellContext';
import { OperatorGate } from '../../components/OperatorGate';
import { DriveConnectionsPanel } from '../../components/DriveConnectionsPanel';
import { RoomsPanel } from '../../components/RoomsPanel';
import { AiConsentHarness } from '../../components/AiConsentHarness';
import { AssistantPanel } from '../../components/AssistantPanel';
import { BillingPanel } from '../../components/BillingPanel';
import { useAuth } from '../../components/AuthContext';
import { isCorePreview } from '../../config/preview';

function DeveloperToolsBody() {
  const { themeMode } = useShell();
  const { workspaceId, csrfToken } = useAuth();
  const palette = colors[themeMode];

  return (
    <div className="daynori-page">
      <h1
        style={{
          margin: `0 0 ${spacing.sm}px`,
          fontSize: typography.webScale.welcomeTitle,
          color: palette.text.primary,
        }}
      >
        Developer tools
      </h1>
      <p style={{ margin: `0 0 ${spacing.base}px`, color: palette.text.secondary, fontSize: 14 }}>
        Restricted operator surfaces. Production release gates for vault, rooms, AI, and billing
        remain closed unless separately authorized — this page does not unlock them.
      </p>

      <Card themeMode={themeMode} style={{ marginBottom: spacing.base }}>
        <h2 style={{ marginTop: 0, fontSize: typography.webScale.sectionHeading }}>Harnesses</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Link href="/dev/vault-harness" style={{ textDecoration: 'none' }}>
            <Button variant="secondary" size="compact" themeMode={themeMode}>
              Synthetic vault harness
            </Button>
          </Link>
          <Link href="/review" style={{ textDecoration: 'none' }}>
            <Button variant="secondary" size="compact" themeMode={themeMode}>
              Component review gallery
            </Button>
          </Link>
        </div>
      </Card>

      {isCorePreview ? (
        <Feedback
          severity="info"
          themeMode={themeMode}
          message="Core preview keeps provisional integration panels unavailable. Operator access does not override preview or production gates."
        />
      ) : workspaceId && csrfToken ? (
        <>
          <Card themeMode={themeMode} id="drive-connections" style={{ marginBottom: spacing.base }}>
            <DriveConnectionsPanel
              workspaceId={workspaceId}
              csrfToken={csrfToken}
              themeMode={themeMode}
            />
          </Card>
          <Card themeMode={themeMode} id="shared-rooms" style={{ marginBottom: spacing.base }}>
            <RoomsPanel
              csrfToken={csrfToken}
              themeMode={themeMode}
              personalWorkspaceId={workspaceId}
            />
          </Card>
          <Card themeMode={themeMode} id="ai-consent" style={{ marginBottom: spacing.base }}>
            <AiConsentHarness
              csrfToken={csrfToken}
              themeMode={themeMode}
              personalWorkspaceId={workspaceId}
            />
          </Card>
          <Card themeMode={themeMode} id="ai-assistant" style={{ marginBottom: spacing.base }}>
            <AssistantPanel
              csrfToken={csrfToken}
              themeMode={themeMode}
              personalWorkspaceId={workspaceId}
            />
          </Card>
          <Card themeMode={themeMode} id="billing-plan">
            <BillingPanel
              csrfToken={csrfToken}
              themeMode={themeMode}
              personalWorkspaceId={workspaceId}
            />
          </Card>
        </>
      ) : (
        <Feedback
          severity="info"
          themeMode={themeMode}
          message="Provision a workspace to open provisional integration harnesses in non-preview builds."
        />
      )}
    </div>
  );
}

export default function DeveloperPage() {
  return (
    <OperatorGate title="Developer tools">
      <DeveloperToolsBody />
    </OperatorGate>
  );
}
