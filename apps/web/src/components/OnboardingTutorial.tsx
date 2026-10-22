'use client';

import { Icon } from '@daynori/ui-web';
import React, { useCallback, useEffect, useId, useState } from 'react';
import { colors, radii, spacing, typography, type IconName } from '@daynori/design-tokens';
import { Button, Dialog, Feedback } from '@daynori/ui-web';
import {
  TUTORIAL_STEPS,
  ONBOARDING_STEP_METADATA,
  ONBOARDING_INTEREST_LABELS,
  SAMPLE_STARTER_TEMPLATE,
  PWA_INSTALL_GUIDE_STEPS,
  getDefaultOnboardingState,
  completeOnboarding,
  skipOnboarding,
  deriveModuleShortcutsFromInterests,
  getSampleFolderId,
  getSampleNoteId,
  getSampleTaskId,
  validateOnboardingState,
  getInitialOnboardingStepIndex,
  mergeOnboardingState,
  type OnboardingInterest,
  type OnboardingStep,
  type OnboardingState,
  getDefaultHomeLayout,
  type HomeLayout,
} from '@daynori/domain';
import { useShell } from './ShellContext';
import { useAuth } from './AuthContext';
import { createWebApiClient } from '../data/webApiClient';

export interface OnboardingTutorialProps {
  isOpen: boolean;
  onClose: () => void;
  isReplay?: boolean;
}

export const OnboardingTutorial: React.FC<OnboardingTutorialProps> = ({
  isOpen,
  onClose,
  isReplay = false,
}) => {
  const { themeMode } = useShell();
  const palette = colors[themeMode];
  const { user, workspaceId, csrfToken } = useAuth();
  const liveRegionId = useId();

  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [selectedInterests, setSelectedInterests] = useState<OnboardingInterest[]>([
    'notes',
    'planning',
    'journal',
    'files',
  ]);
  // Phase 31 repair: Starter content creation is an explicit opt-in choice
  const [createStarterFolder, setCreateStarterFolder] = useState(false);
  const [createStarterNote, setCreateStarterNote] = useState(false);
  const [createStarterTask, setCreateStarterTask] = useState(false);

  const [authoritativeRevision, setAuthoritativeRevision] = useState<number | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const currentStep: OnboardingStep = TUTORIAL_STEPS[currentStepIndex] || 'capture';
  const meta = ONBOARDING_STEP_METADATA[currentStep];

  const draftKey = user?.id ? `daynori:onboarding:${user.id}` : null;

  // Announce step change to assistive technologies
  useEffect(() => {
    if (isOpen) {
      setLiveAnnouncement(meta.announcement);
    }
  }, [isOpen, currentStepIndex, meta.announcement]);

  // Hydrate stored step and selections on open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setErrorMessage(null);

    async function hydrate() {
      if (isReplay) {
        // Replay always starts at step 0, but hydrates user's current interests
        setCurrentStepIndex(0);
        if (csrfToken) {
          try {
            const client = createWebApiClient({ csrfToken });
            const prefRes = await client.getUserPreferences();
            if (isMounted && prefRes?.data) {
              setAuthoritativeRevision(prefRes.data.revision);
              const onb = prefRes.data.preferences?.onboarding;
              if (
                onb?.selectedInterests &&
                Array.isArray(onb.selectedInterests) &&
                onb.selectedInterests.length > 0
              ) {
                setSelectedInterests(onb.selectedInterests);
              }
            }
          } catch {
            // graceful fallback
          }
        }
        return;
      }

      // Normal resume: check local account-scoped draft first
      let localDraft: Partial<OnboardingState> | null = null;
      if (draftKey && typeof window !== 'undefined') {
        try {
          const raw = window.localStorage.getItem(draftKey);
          if (raw) localDraft = JSON.parse(raw);
        } catch {
          // ignore
        }
      }

      if (localDraft?.selectedInterests && localDraft.selectedInterests.length > 0) {
        setSelectedInterests(localDraft.selectedInterests);
      }
      if (localDraft?.step) {
        setCurrentStepIndex(getInitialOnboardingStepIndex(localDraft as OnboardingState, false));
      }

      // Fetch authoritative server preferences
      if (csrfToken) {
        try {
          const client = createWebApiClient({ csrfToken });
          const prefRes = await client.getUserPreferences();
          if (isMounted && prefRes?.data) {
            setAuthoritativeRevision(prefRes.data.revision);
            const serverOnboarding = prefRes.data.preferences?.onboarding;
            if (serverOnboarding) {
              const validated = validateOnboardingState(serverOnboarding);
              if (!localDraft?.step && validated.step && validated.step !== 'completed') {
                setCurrentStepIndex(getInitialOnboardingStepIndex(validated, false));
              }
              if (!localDraft?.selectedInterests && validated.selectedInterests.length > 0) {
                setSelectedInterests(validated.selectedInterests);
              }
            }
          }
        } catch {
          // Non-blocking offline fallback
        }
      }
    }

    void hydrate();

    return () => {
      isMounted = false;
    };
  }, [isOpen, isReplay, draftKey, csrfToken]);

  // Persist draft on step or selection change
  const persistDraft = useCallback(
    (stepIdx: number, interests: OnboardingInterest[]) => {
      if (isReplay || !draftKey || typeof window === 'undefined') return;
      const stepName = TUTORIAL_STEPS[stepIdx] || 'capture';
      try {
        window.localStorage.setItem(
          draftKey,
          JSON.stringify({
            step: stepName,
            selectedInterests: interests,
            updatedAt: new Date().toISOString(),
          })
        );
      } catch {
        // non-blocking
      }
    },
    [isReplay, draftKey]
  );

  const handleInterestToggle = (interest: OnboardingInterest) => {
    setSelectedInterests((prev) => {
      let nextInterests: OnboardingInterest[];
      if (prev.includes(interest)) {
        if (prev.length === 1) return prev;
        nextInterests = prev.filter((i) => i !== interest);
      } else {
        nextInterests = [...prev, interest];
      }
      persistDraft(currentStepIndex, nextInterests);
      return nextInterests;
    });
  };

  const handleNext = () => {
    if (currentStepIndex < TUTORIAL_STEPS.length - 1) {
      const nextIdx = currentStepIndex + 1;
      setCurrentStepIndex(nextIdx);
      persistDraft(nextIdx, selectedInterests);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      const prevIdx = currentStepIndex - 1;
      setCurrentStepIndex(prevIdx);
      persistDraft(prevIdx, selectedInterests);
    }
  };

  const handleSkip = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    let currentOnboarding = getDefaultOnboardingState();
    let targetRevision = authoritativeRevision;

    try {
      const client = createWebApiClient({ csrfToken });
      try {
        const prefRes = await client.getUserPreferences();
        if (prefRes?.data) {
          targetRevision = prefRes.data.revision;
          if (prefRes.data.preferences?.onboarding) {
            currentOnboarding = validateOnboardingState(prefRes.data.preferences.onboarding);
          }
        }
      } catch {
        // Fall back gracefully
      }
    } catch {
      /* ignore */
    }

    const updatedOnboarding = skipOnboarding(currentOnboarding);

    // Persist skip locally immediately before network
    if (draftKey && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          draftKey,
          JSON.stringify({
            step: 'completed',
            skipped: true,
            selectedInterests,
            updatedAt: new Date().toISOString(),
          })
        );
      } catch {
        // ignore
      }
    }

    const pendingKey = user?.id ? `daynori:preferences:pending:${user.id}` : null;
    if (pendingKey && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          pendingKey,
          JSON.stringify({
            preferences: {
              onboarding: updatedOnboarding,
            },
            expectedRevision: targetRevision,
          })
        );
      } catch {
        /* ignore */
      }
    }

    try {
      const client = createWebApiClient({ csrfToken });

      // Concurrency retry loop
      let retries = 2;
      let synced = false;
      while (retries >= 0 && !synced) {
        try {
          await client.updateUserPreferences({
            preferences: {
              onboarding: updatedOnboarding,
            },
            expectedRevision: targetRevision,
          });
          synced = true;
          if (pendingKey && typeof window !== 'undefined') {
            window.localStorage.removeItem(pendingKey);
          }
        } catch (err: unknown) {
          if (
            retries > 0 &&
            err instanceof Error &&
            (err.message.includes('conflict') || err.message.includes('409'))
          ) {
            retries--;
            const latest = await client.getUserPreferences().catch(() => null);
            if (latest?.data) {
              targetRevision = latest.data.revision;
            }
          } else {
            break; // Allow closing even if preference persistence is offline
          }
        }
      }

      setLiveAnnouncement('Tutorial skipped. Welcome to Daynori.');
      onClose();
    } catch {
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, draftKey, csrfToken, authoritativeRevision, onClose]);

  const handleFinish = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    const client = createWebApiClient({ csrfToken });
    let currentOnboarding = getDefaultOnboardingState();
    let currentLayout: HomeLayout | undefined = undefined;
    let targetRevision = authoritativeRevision;

    try {
      const prefRes = await client.getUserPreferences();
      if (prefRes?.data) {
        targetRevision = prefRes.data.revision;
        if (prefRes.data.preferences?.onboarding) {
          currentOnboarding = validateOnboardingState(prefRes.data.preferences.onboarding);
        }
        if (prefRes.data.preferences?.homeLayout) {
          currentLayout = prefRes.data.preferences.homeLayout as HomeLayout;
        }
      }
    } catch {
      // Offline fallback
    }

    if (isReplay) {
      // Replay must never create starter samples, reset user personalization, or delete content
      const preservedOnboarding: OnboardingState = {
        ...currentOnboarding,
        selectedInterests,
      };
      const updatedLayout = currentLayout
        ? deriveModuleShortcutsFromInterests(selectedInterests, currentLayout)
        : deriveModuleShortcutsFromInterests(selectedInterests, getDefaultHomeLayout());

      try {
        await client.updateUserPreferences({
          preferences: {
            homeLayout: updatedLayout,
            onboarding: preservedOnboarding,
          },
          expectedRevision: targetRevision,
        });
      } catch {
        // non-blocking
      }

      setLiveAnnouncement('Tutorial replay completed.');
      onClose();
      setIsSubmitting(false);
      return;
    }

    const createdItemIds = [...(currentOnboarding.createdSampleItemIds || [])];
    let createdFolderId = currentOnboarding.createdFolderId || null;

    try {
      if (workspaceId && user?.id) {
        // 1. Idempotent sample folder creation
        if (createStarterFolder && !createdFolderId) {
          const sampleFolderId = getSampleFolderId(workspaceId, user.id);
          try {
            const existingFolder = await client
              .getFolder(workspaceId, sampleFolderId)
              .catch(() => null);
            if (existingFolder?.data?.id) {
              createdFolderId = existingFolder.data.id;
            } else {
              const folderRes = await client.createFolder(workspaceId, {
                id: sampleFolderId,
                name: SAMPLE_STARTER_TEMPLATE.folderName,
                securityScope: 'standard',
              });
              if (folderRes.data?.id) {
                createdFolderId = folderRes.data.id;
              }
            }
          } catch {
            // Verify if already created concurrently
            const existingFolder = await client
              .getFolder(workspaceId, sampleFolderId)
              .catch(() => null);
            if (existingFolder?.data?.id) {
              createdFolderId = existingFolder.data.id;
            } else {
              setErrorMessage('Failed to create sample folder. Please retry or continue.');
              setIsSubmitting(false);
              return;
            }
          }
        }

        // 2. Idempotent sample note creation
        const sampleNoteId = getSampleNoteId(workspaceId, user.id);
        if (createStarterNote && !createdItemIds.includes(sampleNoteId)) {
          try {
            const existingNote = await client.getNote(workspaceId, sampleNoteId).catch(() => null);
            if (existingNote?.data?.id) {
              createdItemIds.push(sampleNoteId);
            } else {
              await client.createNote(workspaceId, {
                id: sampleNoteId,
                title: SAMPLE_STARTER_TEMPLATE.noteTitle,
                folderId: createdFolderId ?? undefined,
                securityScope: 'standard',
                document: {
                  type: 'doc',
                  version: 1,
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: SAMPLE_STARTER_TEMPLATE.noteSnippet }],
                    },
                  ],
                },
              });
              createdItemIds.push(sampleNoteId);
            }
          } catch {
            const existingNote = await client.getNote(workspaceId, sampleNoteId).catch(() => null);
            if (existingNote?.data?.id) {
              createdItemIds.push(sampleNoteId);
            } else {
              setErrorMessage('Failed to create sample note. Please retry or continue.');
              setIsSubmitting(false);
              return;
            }
          }
        }

        // 3. Idempotent sample task creation
        const sampleTaskId = getSampleTaskId(workspaceId, user.id);
        if (createStarterTask && !createdItemIds.includes(sampleTaskId)) {
          try {
            const existingTask = await client.getTask(workspaceId, sampleTaskId).catch(() => null);
            if (existingTask?.data?.id) {
              createdItemIds.push(sampleTaskId);
            } else {
              await client.createTask(workspaceId, {
                id: sampleTaskId,
                title: SAMPLE_STARTER_TEMPLATE.taskTitle,
                folderId: createdFolderId ?? undefined,
                status: 'todo',
                priority: 'normal',
                isPinned: false,
                securityScope: 'standard',
                tags: [],
                deadline: { type: 'none' },
                subtaskOrder: 0,
              });
              createdItemIds.push(sampleTaskId);
            }
          } catch {
            const existingTask = await client.getTask(workspaceId, sampleTaskId).catch(() => null);
            if (existingTask?.data?.id) {
              createdItemIds.push(sampleTaskId);
            } else {
              setErrorMessage('Failed to create sample task. Please retry or continue.');
              setIsSubmitting(false);
              return;
            }
          }
        }
      }

      // 4. Personalize home layout shortcuts based on chosen interests
      const baseLayout = currentLayout || getDefaultHomeLayout();
      let updatedLayout = deriveModuleShortcutsFromInterests(selectedInterests, baseLayout);

      // 5. Complete onboarding state
      let updatedOnboarding: OnboardingState = {
        ...completeOnboarding(currentOnboarding),
        selectedInterests,
        createdSampleItemIds: createdItemIds,
        createdFolderId,
      };

      // 6. Concurrency retry loop with explicit conflict resolution
      let retries = 2;
      let synced = false;
      while (retries >= 0 && !synced) {
        try {
          await client.updateUserPreferences({
            preferences: {
              homeLayout: updatedLayout,
              onboarding: updatedOnboarding,
            },
            expectedRevision: targetRevision,
          });
          synced = true;
        } catch (err: unknown) {
          if (
            retries > 0 &&
            err instanceof Error &&
            (err.message.includes('conflict') || err.message.includes('409'))
          ) {
            retries--;
            const latest = await client.getUserPreferences().catch(() => null);
            if (latest?.data) {
              targetRevision = latest.data.revision;
              if (latest.data.preferences?.homeLayout) {
                updatedLayout = deriveModuleShortcutsFromInterests(
                  selectedInterests,
                  latest.data.preferences.homeLayout as HomeLayout
                );
              }
              const serverOnb = validateOnboardingState(latest.data.preferences?.onboarding);
              updatedOnboarding = mergeOnboardingState(updatedOnboarding, serverOnb);
            }
          } else {
            break; // Retain offline/optimistic completion
          }
        }
      }

      if (draftKey && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(
            draftKey,
            JSON.stringify({
              step: 'completed',
              skipped: false,
              selectedInterests,
              createdSampleItemIds: createdItemIds,
              createdFolderId,
              updatedAt: new Date().toISOString(),
            })
          );
        } catch {
          // ignore
        }
      }

      const pendingKey = user?.id ? `daynori:preferences:pending:${user.id}` : null;
      if (!synced && pendingKey && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(
            pendingKey,
            JSON.stringify({
              preferences: {
                homeLayout: updatedLayout,
                onboarding: updatedOnboarding,
              },
              expectedRevision: targetRevision,
            })
          );
        } catch {
          /* ignore */
        }
      } else if (synced && pendingKey && typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem(pendingKey);
        } catch {
          /* ignore */
        }
      }

      setLiveAnnouncement('Tutorial completed! Welcome to your Daynori workspace.');
      onClose();
    } catch (err: unknown) {
      console.warn('[Onboarding] Finish error:', err);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => void handleSkip()}
      title={meta.title}
      themeMode={themeMode}
    >
      {/* Hidden ARIA Live Region for screen-reader announcements */}
      <div
        id={liveRegionId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {liveAnnouncement}
      </div>

      <div style={{ padding: `${spacing.md}px 0` }}>
        {/* Progress Indicator */}
        <div
          role="progressbar"
          aria-valuenow={currentStepIndex + 1}
          aria-valuemin={1}
          aria-valuemax={3}
          aria-label={`Step ${currentStepIndex + 1} of 3`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: `${spacing.base}px`,
            paddingBottom: `${spacing.sm}px`,
            borderBottom: `1px solid ${palette.border.subtle}`,
          }}
        >
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: palette.action.primary,
            }}
          >
            Step {currentStepIndex + 1} of 3
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {TUTORIAL_STEPS.map((step, idx) => (
              <span
                key={step}
                style={{
                  width: idx === currentStepIndex ? '24px' : '8px',
                  height: '8px',
                  borderRadius: '4px',
                  backgroundColor:
                    idx === currentStepIndex
                      ? palette.action.primary
                      : idx < currentStepIndex
                        ? palette.border.strong
                        : palette.border.subtle,
                  transition: 'all 0.2s ease',
                }}
              />
            ))}
          </div>
        </div>

        {errorMessage && (
          <div style={{ marginBottom: `${spacing.base}px` }}>
            <Feedback
              severity="danger"
              message={errorMessage}
              onDismiss={() => setErrorMessage(null)}
              themeMode={themeMode}
            />
          </div>
        )}

        {currentStep === 'capture' && (
          <div>
            <p
              id="onboarding-step-desc"
              className="daynori-break"
              style={{
                fontSize: `${typography.webScale.body}px`,
                color: palette.text.secondary,
                lineHeight: 1.5,
                margin: `0 0 ${spacing.base}px 0`,
              }}
            >
              {meta.description}
            </p>

            <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: palette.text.primary,
                  marginBottom: `${spacing.sm}px`,
                }}
              >
                Show shortcuts for:
              </legend>

              <div className="daynori-responsive-grid" style={{ marginBottom: `${spacing.base}px` }}>
                {(['notes', 'planning', 'journal', 'files'] as OnboardingInterest[]).map(
                  (interest) => {
                    const info = ONBOARDING_INTEREST_LABELS[interest];
                    const isSelected = selectedInterests.includes(interest);
                    return (
                      <label
                        key={interest}
                        htmlFor={`interest-${interest}`}
                        className="daynori-break"
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: `${spacing.sm}px`,
                          padding: `${spacing.sm}px`,
                          borderRadius: `${radii.card}px`,
                          backgroundColor: isSelected ? palette.surfaceRaised : palette.surface,
                          border: `2px solid ${
                            isSelected ? palette.action.primary : palette.border.subtle
                          }`,
                          cursor: 'pointer',
                          minWidth: 0,
                        }}
                      >
                        <input
                          type="checkbox"
                          id={`interest-${interest}`}
                          checked={isSelected}
                          onChange={() => handleInterestToggle(interest)}
                          style={{
                            marginTop: '3px',
                            cursor: 'pointer',
                            accentColor: palette.action.primary,
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '14px',
                              fontWeight: 600,
                              color: palette.text.primary,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <Icon name={info.icon as IconName} />
                            {info.label}
                          </div>
                          <div
                            style={{
                              fontSize: '12px',
                              color: palette.text.secondary,
                              marginTop: '2px',
                            }}
                          >
                            {info.description}
                          </div>
                        </div>
                      </label>
                    );
                  }
                )}
              </div>
            </fieldset>

            <p
              className="daynori-break"
              style={{
                fontSize: '12px',
                color: palette.text.muted,
                lineHeight: 1.45,
                margin: 0,
              }}
            >
              Shortcuts only change the home screen. Every core feature stays available in the menu.
            </p>
          </div>
        )}

        {currentStep === 'planning' && (
          <div>
            <p
              id="onboarding-step-desc"
              className="daynori-break"
              style={{
                fontSize: `${typography.webScale.body}px`,
                color: palette.text.secondary,
                lineHeight: 1.5,
                margin: `0 0 ${spacing.base}px 0`,
              }}
            >
              {meta.description}
            </p>

            <div className="daynori-responsive-grid" style={{ marginBottom: `${spacing.base}px` }}>
              <div
                className="daynori-break"
                style={{
                  padding: `${spacing.sm}px`,
                  borderRadius: `${radii.card}px`,
                  border: `1px solid ${palette.border.subtle}`,
                  backgroundColor: palette.surfaceRaised,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: `${spacing.xs}px`,
                    fontWeight: 700,
                    fontSize: '15px',
                    color: palette.text.primary,
                    marginBottom: `${spacing.xs}px`,
                  }}
                >
                  <Icon name="check" /> Task
                </div>
                <p
                  style={{
                    fontSize: '13px',
                    color: palette.text.secondary,
                    lineHeight: 1.45,
                    margin: 0,
                  }}
                >
                  Example: “Buy milk.” Finish it once — it does not come back by itself.
                </p>
              </div>

              <div
                className="daynori-break"
                style={{
                  padding: `${spacing.sm}px`,
                  borderRadius: `${radii.card}px`,
                  border: `1px solid ${palette.border.subtle}`,
                  backgroundColor: palette.surfaceRaised,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: `${spacing.xs}px`,
                    fontWeight: 700,
                    fontSize: '15px',
                    color: palette.text.primary,
                    marginBottom: `${spacing.xs}px`,
                  }}
                >
                  <Icon name="repeat" /> Routine
                </div>
                <p
                  style={{
                    fontSize: '13px',
                    color: palette.text.secondary,
                    lineHeight: 1.45,
                    margin: 0,
                  }}
                >
                  Example: “Morning stretch.” Completing today keeps tomorrow’s occurrence.
                </p>
              </div>
            </div>

            <p
              className="daynori-break"
              style={{
                fontSize: '12px',
                color: palette.text.muted,
                lineHeight: 1.45,
                margin: 0,
              }}
            >
              Find saved tasks and routines in Plan. Reminder delivery is unavailable in this
              testing preview.
            </p>
          </div>
        )}

        {currentStep === 'organize' && (
          <div>
            <p
              id="onboarding-step-desc"
              className="daynori-break"
              style={{
                fontSize: `${typography.webScale.body}px`,
                color: palette.text.secondary,
                lineHeight: 1.5,
                margin: `0 0 ${spacing.base}px 0`,
              }}
            >
              {meta.description}
            </p>

            {!isReplay && (
              <fieldset style={{ border: 'none', padding: 0, margin: `0 0 ${spacing.base}px 0` }}>
                <legend
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: palette.text.primary,
                    marginBottom: `${spacing.sm}px`,
                  }}
                >
                  Optional sample items
                </legend>

                <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.xs}px` }}>
                  {(
                    [
                      {
                        id: 'create-starter-folder',
                        checked: createStarterFolder,
                        set: setCreateStarterFolder,
                        label: `Folder: ${SAMPLE_STARTER_TEMPLATE.folderName}`,
                      },
                      {
                        id: 'create-starter-note',
                        checked: createStarterNote,
                        set: setCreateStarterNote,
                        label: `Note: ${SAMPLE_STARTER_TEMPLATE.noteTitle}`,
                      },
                      {
                        id: 'create-starter-task',
                        checked: createStarterTask,
                        set: setCreateStarterTask,
                        label: `Task: ${SAMPLE_STARTER_TEMPLATE.taskTitle}`,
                      },
                    ] as const
                  ).map((opt) => (
                    <label
                      key={opt.id}
                      htmlFor={opt.id}
                      className="daynori-break"
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: `${spacing.sm}px`,
                        fontSize: '13px',
                        color: palette.text.primary,
                        cursor: 'pointer',
                        minHeight: '44px',
                        paddingTop: '8px',
                      }}
                    >
                      <input
                        type="checkbox"
                        id={opt.id}
                        checked={opt.checked}
                        onChange={(e) => opt.set(e.target.checked)}
                        style={{ accentColor: palette.action.primary, marginTop: '2px' }}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <details
              style={{
                fontSize: '13px',
                color: palette.text.secondary,
                marginBottom: `${spacing.sm}px`,
                borderRadius: `${radii.sm}px`,
                border: `1px solid ${palette.border.subtle}`,
                padding: `${spacing.sm}px`,
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  fontWeight: 700,
                  color: palette.text.primary,
                  minHeight: '44px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                Install on your phone (optional)
              </summary>
              <ol
                className="daynori-break"
                style={{ margin: `${spacing.sm}px 0 0`, paddingLeft: '1.25rem', lineHeight: 1.45 }}
              >
                {PWA_INSTALL_GUIDE_STEPS.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </details>

            <p
              className="daynori-break"
              style={{
                fontSize: '12px',
                color: palette.text.muted,
                lineHeight: 1.45,
                margin: 0,
              }}
            >
              Replay this guide anytime from Help or Settings. Replay never duplicates samples.
            </p>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: `${spacing.sm}px`,
            marginTop: `${spacing.lg}px`,
            paddingTop: `${spacing.base}px`,
            borderTop: `1px solid ${palette.border.subtle}`,
          }}
        >
          <Button
            variant="subtle"
            size="compact"
            themeMode={themeMode}
            onClick={handleSkip}
            disabled={isSubmitting}
            id="onboarding-skip-btn"
          >
            Skip
          </Button>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: `${spacing.sm}px` }}>
            {currentStepIndex > 0 && (
              <Button
                variant="secondary"
                size="compact"
                themeMode={themeMode}
                onClick={handleBack}
                disabled={isSubmitting}
                id="onboarding-back-btn"
              >
                Back
              </Button>
            )}

            {currentStepIndex < TUTORIAL_STEPS.length - 1 ? (
              <Button
                variant="primary"
                size="compact"
                themeMode={themeMode}
                onClick={handleNext}
                disabled={isSubmitting}
                id="onboarding-continue-btn"
              >
                Next
              </Button>
            ) : (
              <Button
                variant="primary"
                size="compact"
                themeMode={themeMode}
                onClick={handleFinish}
                disabled={isSubmitting}
                id="onboarding-finish-btn"
              >
                {isSubmitting ? 'Saving…' : 'Done'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
};
