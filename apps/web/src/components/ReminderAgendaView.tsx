'use client';

import { Icon } from '@daynori/ui-web';
import React, { useState, useEffect, useCallback } from 'react';
import { colors, radii, spacing, touchTargets, typography } from '@daynori/design-tokens';
import { Button, Card, EmptyState, Feedback, type FeedbackSeverity } from '@daynori/ui-web';
import type { DaynoriApiClient } from '@daynori/api-client';
import type { ReminderInstance } from '@daynori/contracts';
import {
  getWebPushCapabilityStateAsync,
  subscribeWebPushAsync,
  unsubscribeWebPushAsync,
  getMobilePwaPlatformInfo,
  getPwaPushPrivacyMode,
  setPwaPushPrivacyMode,
  sendLocalTestNotificationAsync,
  type WebPushCapabilityState,
  type MobilePwaPlatformInfo,
} from '../notifications/webPushManager';
import { createWebApiClient } from '../data/webApiClient';

export interface ReminderAgendaViewProps {
  workspaceId: string | null;
  isAuthenticated: boolean;
  userId?: string | null;
  apiClient?: DaynoriApiClient | null;
  themeMode?: 'light' | 'dark';
  onNavigateToItem?: (targetType: string, targetId: string) => void;
}

export function ReminderAgendaView({
  workspaceId,
  isAuthenticated,
  userId,
  apiClient: passedApiClient,
  themeMode = 'light',
  onNavigateToItem,
}: ReminderAgendaViewProps) {
  const palette = colors[themeMode];
  const apiClient = React.useMemo(() => passedApiClient || createWebApiClient(), [passedApiClient]);

  const [capability, setCapability] = useState<WebPushCapabilityState | null>(null);
  const [platformInfo, setPlatformInfo] = useState<MobilePwaPlatformInfo | null>(null);
  const [privacyMode, setPrivacyMode] = useState<'generic' | 'detailed'>('generic');
  const [instances, setInstances] = useState<ReminderInstance[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasCachedData, setHasCachedData] = useState<boolean>(false);
  const [isMutatingPush, setIsMutatingPush] = useState<boolean>(false);
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [feedback, setFeedback] = useState<{
    severity: FeedbackSeverity;
    message: string;
  } | null>(null);

  const activeWorkspaceIdRef = React.useRef<string | null>(workspaceId);

  // Clear instances immediately on workspace or auth changes to prevent account leakage
  useEffect(() => {
    activeWorkspaceIdRef.current = workspaceId;
    setInstances([]);
    setHasCachedData(false);
  }, [workspaceId, isAuthenticated]);

  // Load browser capability state & platform info
  const refreshCapability = useCallback(async () => {
    const cap = await getWebPushCapabilityStateAsync();
    setCapability(cap);
    setPlatformInfo(getMobilePwaPlatformInfo());
    setPrivacyMode(getPwaPushPrivacyMode());
  }, []);

  // Load reminder instances from API or account-scoped local cache
  const loadInstances = useCallback(async () => {
    if (!workspaceId || !isAuthenticated) {
      setInstances([]);
      setIsLoading(false);
      return;
    }

    const targetWsId = workspaceId;
    const cacheKey = `daynori_agenda_cache_${targetWsId}`;

    try {
      setIsLoading(true);
      if (apiClient && navigator.onLine) {
        const res = await apiClient.listReminderInstances(targetWsId);
        // Guard against race condition: if workspace changed while fetching, discard result
        if (activeWorkspaceIdRef.current !== targetWsId) return;

        setInstances(res.data);
        setHasCachedData(true);
        // Persist account-scoped cache
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(cacheKey, JSON.stringify(res.data));
          } catch {
            // Storage full / restricted
          }
        }
      } else {
        // Offline: try reading account-scoped local cache
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem(cacheKey);
          if (raw) {
            const cached: ReminderInstance[] = JSON.parse(raw);
            if (activeWorkspaceIdRef.current === targetWsId) {
              setInstances(cached);
              setHasCachedData(true);
            }
          } else {
            setInstances([]);
            setHasCachedData(false);
          }
        }
      }
    } catch (err: unknown) {
      // In network failure, attempt reading account cache
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(cacheKey);
        if (raw) {
          try {
            const cached: ReminderInstance[] = JSON.parse(raw);
            if (activeWorkspaceIdRef.current === targetWsId) {
              setInstances(cached);
              setHasCachedData(true);
            }
          } catch {
            setInstances([]);
            setHasCachedData(false);
          }
        } else {
          setInstances([]);
          setHasCachedData(false);
        }
      }
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({
        severity: 'warning',
        message: `Could not reach reminder service: ${msg}. Showing local status.`,
      });
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, workspaceId, isAuthenticated]);

  useEffect(() => {
    void refreshCapability();
    void loadInstances();
  }, [refreshCapability, loadInstances]);

  // Network online/offline listener
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void loadInstances();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadInstances]);

  // Opt-in / Subscribe handler
  const handleSubscribe = async () => {
    if (!apiClient) return;
    setIsMutatingPush(true);
    setFeedback(null);
    try {
      const updated = await subscribeWebPushAsync(apiClient, userId || undefined);
      setCapability(updated);
      if (updated.isSubscribed) {
        setFeedback({
          severity: 'success',
          message: 'Browser notifications enabled! Reminders will be delivered via Web Push.',
        });
      } else if (updated.permission === 'denied') {
        setFeedback({
          severity: 'warning',
          message:
            'Notification permission was denied. You can re-enable it in browser site settings.',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ severity: 'danger', message: `Subscription failed: ${msg}` });
    } finally {
      setIsMutatingPush(false);
    }
  };

  // Unsubscribe handler
  const handleUnsubscribe = async () => {
    if (!apiClient) return;
    setIsMutatingPush(true);
    setFeedback(null);
    try {
      const updated = await unsubscribeWebPushAsync(apiClient);
      setCapability(updated);
      setFeedback({
        severity: 'info',
        message: 'Browser notifications disabled. Reminders will continue in-app.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ severity: 'danger', message: `Unsubscribe failed: ${msg}` });
    } finally {
      setIsMutatingPush(false);
    }
  };

  // Content privacy preference toggle
  const handlePrivacyModeChange = (mode: 'generic' | 'detailed') => {
    setPrivacyMode(mode);
    setPwaPushPrivacyMode(mode);
  };

  // Test Notification handler (deliberate user action proving delivery)
  const handleSendTestNotification = async () => {
    setIsSendingTest(true);
    setFeedback(null);
    try {
      // 1. Trigger local notification on device
      const localResult = await sendLocalTestNotificationAsync({
        privacyMode,
      });

      // 2. Trigger server test delivery receipt if online & in personal workspace
      let serverSummary = '';
      if (workspaceId && isAuthenticated && apiClient && isOnline) {
        try {
          const res = await apiClient.sendTestWebPushNotification(workspaceId, {
            privacyMode,
          });
          serverSummary = res.data.message;
        } catch {
          // Server push route may be gated or local
        }
      }

      if (localResult || serverSummary) {
        setFeedback({
          severity: 'success',
          message: serverSummary
            ? `Test notification dispatched! ${serverSummary}`
            : 'Test notification displayed locally on your device.',
        });
      } else {
        setFeedback({
          severity: 'info',
          message:
            'Test notification triggered. If an alert does not appear, check browser and system notification settings.',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({
        severity: 'warning',
        message: `Test notification could not be delivered: ${msg}`,
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const getDeliveryStateLabel = (status: string) => {
    switch (status) {
      case 'observed':
        return { label: 'Observed / Tapped', color: palette.status.success };
      case 'delivered':
        return { label: 'Provider Accepted', color: palette.action.primary };
      case 'dispatched':
        return { label: 'Worker Dispatched', color: palette.status.warning };
      case 'failed':
        return { label: 'Failed', color: palette.status.danger };
      case 'expired':
        return { label: 'Expired', color: palette.text.secondary };
      case 'pending':
      default:
        return { label: 'Scheduled', color: palette.text.secondary };
    }
  };

  const sortedInstances = [...instances].sort((a, b) => {
    const timeA = new Date(a.snoozeUntil || a.scheduledAt).getTime();
    const timeB = new Date(b.snoozeUntil || b.scheduledAt).getTime();
    return timeA - timeB;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
      {/* 1. Offline Mode Banner */}
      {!isOnline && (
        <Feedback
          severity="warning"
          message={
            hasCachedData
              ? 'Operating offline. Displaying locally cached reminders saved from your last connection.'
              : 'Operating offline. No cached reminders found for this account. Reminders will synchronize when reconnected.'
          }
          themeMode={themeMode}
        />
      )}

      {/* 2. Feedback Alert */}
      {feedback && (
        <Feedback severity={feedback.severity} message={feedback.message} themeMode={themeMode} />
      )}

      {/* 3. Browser Capability & Push Controls */}
      <Card themeMode={themeMode}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: `${spacing.sm}px`,
          }}
        >
          <div>
            <h2
              style={{
                margin: '0 0 4px 0',
                fontSize: `${typography.webScale.sectionHeading}px`,
                color: palette.text.primary,
              }}
            >
              Browser Reminders & Web Push
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: '13px',
                color: palette.text.secondary,
                maxWidth: '520px',
              }}
            >
              {capability?.statusDetails || 'Detecting browser notification capabilities...'}
            </p>
          </div>

          {/* Status Badge */}
          <div
            style={{
              padding: '4px 10px',
              borderRadius: `${radii.sm}px`,
              fontSize: '12px',
              fontWeight: 700,
              backgroundColor: capability?.isSubscribed
                ? palette.status.success + '20'
                : capability?.permission === 'denied'
                  ? palette.status.danger + '20'
                  : palette.surfaceRaised,
              color: capability?.isSubscribed
                ? palette.status.success
                : capability?.permission === 'denied'
                  ? palette.status.danger
                  : palette.text.secondary,
              border: `1px solid ${palette.border.subtle}`,
            }}
          >
            {capability?.isSubscribed ? (
              <>
                <Icon name="check" /> Web Push Subscribed
              </>
            ) : capability?.permission === 'denied' ? (
              <>
                <Icon name="x" /> Permission Blocked
              </>
            ) : !capability?.isSupported ? (
              'Push Unsupported'
            ) : (
              'Push Inactive'
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div
          style={{
            display: 'flex',
            gap: `${spacing.sm}px`,
            marginTop: `${spacing.base}px`,
            flexWrap: 'wrap',
          }}
        >
          {capability?.isSupported &&
            !capability.isSubscribed &&
            capability.permission !== 'denied' && (
              <Button
                variant="primary"
                size="compact"
                themeMode={themeMode}
                onClick={handleSubscribe}
                disabled={isMutatingPush || !isAuthenticated}
                id="enable-web-push-btn"
              >
                {isMutatingPush ? 'Connecting...' : 'Enable Browser Notifications'}
              </Button>
            )}

          {capability?.isSubscribed && (
            <Button
              variant="secondary"
              size="compact"
              themeMode={themeMode}
              onClick={handleUnsubscribe}
              disabled={isMutatingPush}
              id="disable-web-push-btn"
            >
              {isMutatingPush ? 'Updating...' : 'Disable Browser Notifications'}
            </Button>
          )}

          <Button
            variant="secondary"
            size="compact"
            themeMode={themeMode}
            onClick={handleSendTestNotification}
            disabled={isSendingTest}
            id="send-test-notification-btn"
          >
            {isSendingTest ? 'Sending Test…' : 'Send Test Notification'}
          </Button>

          <Button
            variant="subtle"
            size="compact"
            themeMode={themeMode}
            onClick={() => {
              void refreshCapability();
              void loadInstances();
            }}
            id="refresh-agenda-btn"
          >
            Refresh Agenda
          </Button>
        </div>

        {/* Platform Guidance: iOS PWA Home Screen & Android Chrome */}
        {platformInfo?.iosRequiresHomeScreen && (
          <div
            id="ios-homescreen-pwa-guidance"
            style={{
              marginTop: `${spacing.base}px`,
              padding: `${spacing.sm}px ${spacing.base}px`,
              borderRadius: `${radii.sm}px`,
              backgroundColor: palette.status.warning + '18',
              border: `1px solid ${palette.status.warning}44`,
              fontSize: '12px',
              color: palette.text.primary,
              lineHeight: 1.4,
            }}
          >
            <strong>iPhone / iPad Requirement:</strong> {platformInfo.guidanceText}
          </div>
        )}

        {platformInfo?.isAndroid && (
          <div
            id="android-chrome-pwa-guidance"
            style={{
              marginTop: `${spacing.base}px`,
              padding: `${spacing.sm}px ${spacing.base}px`,
              borderRadius: `${radii.sm}px`,
              backgroundColor: palette.action.primary + '10',
              border: `1px solid ${palette.action.primary}30`,
              fontSize: '12px',
              color: palette.text.primary,
              lineHeight: 1.4,
            }}
          >
            <strong>Android Chrome Setup:</strong> {platformInfo.guidanceText}
          </div>
        )}

        {/* Content Privacy Controls */}
        <div
          style={{
            marginTop: `${spacing.base}px`,
            padding: `${spacing.sm}px ${spacing.base}px`,
            borderRadius: `${radii.sm}px`,
            backgroundColor: palette.surfaceRaised,
            border: `1px solid ${palette.border.subtle}`,
          }}
        >
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: palette.text.primary,
              marginBottom: '4px',
            }}
          >
            Notification Preview Privacy
          </div>
          <p
            style={{
              margin: '0 0 10px 0',
              fontSize: '12px',
              color: palette.text.secondary,
              lineHeight: 1.4,
            }}
          >
            Select preview detail for device lock screens. Journal entries, notes, and private files
            are strictly excluded from push notification payloads.
          </p>
          <div style={{ display: 'flex', gap: `${spacing.base}px`, flexWrap: 'wrap' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                cursor: 'pointer',
                color: palette.text.primary,
              }}
            >
              <input
                type="radio"
                name="pwaPushPrivacy"
                value="generic"
                checked={privacyMode === 'generic'}
                onChange={() => handlePrivacyModeChange('generic')}
                id="privacy-mode-generic"
              />
              <span>Privacy-minimized ('Daynori Reminder')</span>
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                cursor: 'pointer',
                color: palette.text.primary,
              }}
            >
              <input
                type="radio"
                name="pwaPushPrivacy"
                value="detailed"
                checked={privacyMode === 'detailed'}
                onChange={() => handlePrivacyModeChange('detailed')}
                id="privacy-mode-detailed"
              />
              <span>Detailed (shows task/routine title)</span>
            </label>
          </div>
        </div>

        {/* Architectural Disclosures */}
        <div
          style={{
            marginTop: `${spacing.base}px`,
            padding: `${spacing.sm}px`,
            borderRadius: `${radii.sm}px`,
            backgroundColor: palette.surfaceRaised,
            fontSize: '12px',
            color: palette.text.secondary,
            lineHeight: 1.4,
          }}
        >
          <strong>Platform Delivery Matrix:</strong> PWA installation or background tabs do not
          establish guaranteed local timers. Reminders are reliably monitored through this in-app
          agenda and delivered via Web Push when supported and authorized.
        </div>
      </Card>

      {/* 4. Agenda Reminders List */}
      <Card themeMode={themeMode}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: `${spacing.sm}px`,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: `${typography.webScale.sectionHeading}px`,
              color: palette.text.primary,
            }}
          >
            Scheduled Reminders ({sortedInstances.length})
          </h2>
          <span style={{ fontSize: '12px', color: palette.text.secondary }}>
            {isLoading
              ? 'Checking schedule...'
              : isOnline
                ? 'Synced with server'
                : 'Cached offline'}
          </span>
        </div>

        {sortedInstances.length === 0 ? (
          <EmptyState
            title="No scheduled reminders"
            description="Reminders configured for tasks and routines will appear in this agenda."
            themeMode={themeMode}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.xs}px` }}>
            {sortedInstances.map((inst) => {
              const scheduledDate = new Date(inst.snoozeUntil || inst.scheduledAt);
              const formattedTime = scheduledDate.toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={inst.id}
                  id={`reminder-instance-${inst.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: `${spacing.sm}px ${spacing.base}px`,
                    borderRadius: `${radii.sm}px`,
                    border: `1px solid ${palette.border.subtle}`,
                    backgroundColor: palette.surface,
                    minHeight: `${touchTargets.webMin}px`,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.xs}px` }}>
                      <span
                        style={{ fontSize: '14px', fontWeight: 600, color: palette.text.primary }}
                      >
                        {inst.targetType === 'task' ? 'Task Reminder' : 'Routine Reminder'}
                      </span>
                      {inst.snoozeUntil && (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: palette.action.primary + '15',
                            color: palette.action.primary,
                          }}
                        >
                          Snoozed (Gen {inst.deliveryGeneration})
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                      <span style={{ fontSize: '12px', color: palette.text.secondary }}>
                        Due: {formattedTime}
                      </span>
                      <span
                        id={`delivery-state-${inst.id}`}
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '1px 6px',
                          borderRadius: '4px',
                          backgroundColor: getDeliveryStateLabel(inst.status).color + '20',
                          color: getDeliveryStateLabel(inst.status).color,
                        }}
                      >
                        {getDeliveryStateLabel(inst.status).label}
                      </span>
                    </div>
                  </div>

                  {onNavigateToItem && (
                    <Button
                      variant="secondary"
                      size="compact"
                      themeMode={themeMode}
                      onClick={() => onNavigateToItem(inst.targetType, inst.targetId)}
                      id={`view-source-${inst.id}`}
                    >
                      View Source
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
