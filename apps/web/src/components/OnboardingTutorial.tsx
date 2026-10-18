'use client';

import React, { useCallback, useEffect, useId, useState } from 'react';
import { colors, radii, spacing, typography } from '@daynori/design-tokens';
import { Button, Dialog, Feedback } from '@daynori/ui-web';
import {
  TUTORIAL_STEPS,
  ONBOARDING_STEP_METADATA,
  ONBOARDING_INTEREST_LABELS,
  SAMPLE_STARTER_TEMPLATE,
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

        {/* STEP 1: CAPTURE ANYTHING */}
        {currentStep === 'capture' && (
          <div>
            <p
              id="onboarding-step-desc"
              style={{
                fontSize: `${typography.webScale.body}px`,
                color: palette.text.secondary,
                lineHeight: 1.6,
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
                Select your focus areas:
              </legend>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: `${spacing.sm}px`,
                  marginBottom: `${spacing.base}px`,
                }}
              >
                {(['notes', 'planning', 'journal', 'files'] as OnboardingInterest[]).map(
                  (interest) => {
                    const info = ONBOARDING_INTEREST_LABELS[interest];
                    const isSelected = selectedInterests.includes(interest);
                    return (
                      <label
                        key={interest}
                        htmlFor={`interest-${interest}`}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: `${spacing.sm}px`,
                          padding: `${spacing.base}px`,
                          borderRadius: `${radii.card}px`,
                          backgroundColor: isSelected ? palette.surfaceRaised : palette.surface,
                          border: `2px solid ${
                            isSelected ? palette.action.primary : palette.border.subtle
                          }`,
                          cursor: 'pointer',
                          transition: 'border-color 0.2s, background-color 0.2s',
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
                          }}
                        />
                        <div>
                          <div
                            style={{
                              fontSize: '14px',
                              fontWeight: 600,
                              color: palette.text.primary,
                            }}
                          >
                            <span style={{ marginRight: '6px' }}>{info.icon}</span>
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

            <div
              style={{
                fontSize: '12px',
                color: palette.text.muted,
                lineHeight: 1.5,
                padding: `${spacing.xs}px ${spacing.sm}px`,
                backgroundColor: palette.background,
                borderRadius: `${radii.sm}px`,
              }}
            >
              ℹ️ Visibility changes presentation shortcuts only. All core features remain authorized
              and accessible at any time.
            </div>
          </div>
        )}

        {/* STEP 2: PLAN TASKS VS ROUTINES */}
        {currentStep === 'planning' && (
          <div>
            <p
              id="onboarding-step-desc"
              style={{
                fontSize: `${typography.webScale.body}px`,
                color: palette.text.secondary,
                lineHeight: 1.6,
                margin: `0 0 ${spacing.base}px 0`,
              }}
            >
              {meta.description}
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: `${spacing.base}px`,
                marginBottom: `${spacing.base}px`,
              }}
            >
              {/* Task card */}
              <div
                style={{
                  padding: `${spacing.base}px`,
                  borderRadius: `${radii.card}px`,
                  border: `1px solid ${palette.border.subtle}`,
                  backgroundColor: palette.surfaceRaised,
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
                  <span>✓</span> One-off Tasks
                </div>
                <p
                  style={{
                    fontSize: '13px',
                    color: palette.text.secondary,
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  Single deadlines, action items, and project checklists. Once marked complete, a
                  task is finished and won't reappear automatically.
                </p>
              </div>

              {/* Routine card */}
              <div
                style={{
                  padding: `${spacing.base}px`,
                  borderRadius: `${radii.card}px`,
                  border: `1px solid ${palette.border.subtle}`,
                  backgroundColor: palette.surfaceRaised,
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
                  <span>🔁</span> Daily Routines
                </div>
                <p
                  style={{
                    fontSize: '13px',
                    color: palette.text.secondary,
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  Repeatable habits that generate scheduled occurrences on Today. Marking today's
                  occurrence done leaves tomorrow's routine intact.
                </p>
              </div>
            </div>

            <div
              style={{
                fontSize: '12px',
                color: palette.text.muted,
                lineHeight: 1.5,
                padding: `${spacing.xs}px ${spacing.sm}px`,
                backgroundColor: palette.background,
                borderRadius: `${radii.sm}px`,
              }}
            >
              💡 Reminders are scheduled per item. Notification permissions are requested only when
              you explicitly add a reminder.
            </div>
          </div>
        )}

        {/* STEP 3: ORGANIZE & PERSONALIZE */}
        {currentStep === 'organize' && (
          <div>
            <p
              id="onboarding-step-desc"
              style={{
                fontSize: `${typography.webScale.body}px`,
                color: palette.text.secondary,
                lineHeight: 1.6,
                margin: `0 0 ${spacing.base}px 0`,
              }}
            >
              {meta.description}
            </p>

            <fieldset style={{ border: 'none', padding: 0, margin: `0 0 ${spacing.base}px 0` }}>
              <legend
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: palette.text.primary,
                  marginBottom: `${spacing.sm}px`,
                }}
              >
                Starter examples (opt-in):
              </legend>

              <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.xs}px` }}>
                <label
                  htmlFor="create-starter-folder"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: `${spacing.sm}px`,
                    fontSize: '13px',
                    color: palette.text.primary,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    id="create-starter-folder"
                    checked={createStarterFolder}
                    onChange={(e) => setCreateStarterFolder(e.target.checked)}
                    style={{ accentColor: palette.action.primary }}
                  />
                  <span>
                    Create initial folder: <strong>{SAMPLE_STARTER_TEMPLATE.folderName}</strong>
                  </span>
                </label>

                <label
                  htmlFor="create-starter-note"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: `${spacing.sm}px`,
                    fontSize: '13px',
                    color: palette.text.primary,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    id="create-starter-note"
                    checked={createStarterNote}
                    onChange={(e) => setCreateStarterNote(e.target.checked)}
                    style={{ accentColor: palette.action.primary }}
                  />
                  <span>
                    Create sample note: <em>{SAMPLE_STARTER_TEMPLATE.noteTitle}</em>
                  </span>
                </label>

                <label
                  htmlFor="create-starter-task"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: `${spacing.sm}px`,
                    fontSize: '13px',
                    color: palette.text.primary,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    id="create-starter-task"
                    checked={createStarterTask}
                    onChange={(e) => setCreateStarterTask(e.target.checked)}
                    style={{ accentColor: palette.action.primary }}
                  />
                  <span>
                    Create sample task: <em>{SAMPLE_STARTER_TEMPLATE.taskTitle}</em>
                  </span>
                </label>
              </div>
            </fieldset>

            <div
              style={{
                fontSize: '12px',
                color: palette.text.muted,
                lineHeight: 1.5,
                padding: `${spacing.xs}px ${spacing.sm}px`,
                backgroundColor: palette.background,
                borderRadius: `${radii.sm}px`,
              }}
            >
              🔒 Samples are clearly labeled and completely removable. We never silently populate
              your workspace.
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: `${spacing.lg}px`,
            paddingTop: `${spacing.base}px`,
            borderTop: `1px solid ${palette.border.subtle}`,
          }}
        >
          <div>
            <Button
              variant="subtle"
              size="compact"
              themeMode={themeMode}
              onClick={handleSkip}
              disabled={isSubmitting}
              id="onboarding-skip-btn"
            >
              Skip Tutorial
            </Button>
          </div>

          <div style={{ display: 'flex', gap: `${spacing.sm}px` }}>
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
                Continue
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
                {isSubmitting ? 'Setting Up...' : 'Finish & Enter Daynori'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
};
