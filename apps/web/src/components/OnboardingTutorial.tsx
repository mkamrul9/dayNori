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
  const [createStarterFolder, setCreateStarterFolder] = useState(true);
  const [createStarterNote, setCreateStarterNote] = useState(true);
  const [createStarterTask, setCreateStarterTask] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const currentStep: OnboardingStep = TUTORIAL_STEPS[currentStepIndex] || 'capture';
  const meta = ONBOARDING_STEP_METADATA[currentStep];

  // Announce step change to assistive technologies
  useEffect(() => {
    if (isOpen) {
      setLiveAnnouncement(meta.announcement);
    }
  }, [isOpen, currentStepIndex, meta.announcement]);

  // Reset to first step when dialog opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStepIndex(0);
      setErrorMessage(null);
    }
  }, [isOpen]);

  const handleInterestToggle = (interest: OnboardingInterest) => {
    setSelectedInterests((prev) => {
      if (prev.includes(interest)) {
        // Keep at least one interest selected
        if (prev.length === 1) return prev;
        return prev.filter((i) => i !== interest);
      }
      return [...prev, interest];
    });
  };

  const handleNext = () => {
    if (currentStepIndex < TUTORIAL_STEPS.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleSkip = useCallback(async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const client = createWebApiClient({ csrfToken });
      let currentOnboarding = getDefaultOnboardingState();
      let currentLayout = getDefaultHomeLayout();
      try {
        const prefRes = await client.getUserPreferences();
        if (prefRes?.data?.preferences?.onboarding) {
          currentOnboarding = prefRes.data.preferences.onboarding as OnboardingState;
        }
        if (prefRes?.data?.preferences?.homeLayout) {
          currentLayout = prefRes.data.preferences.homeLayout as HomeLayout;
        }
      } catch {
        // Fall back gracefully
      }

      const updatedOnboarding = skipOnboarding(currentOnboarding);

      await client.updateUserPreferences({
        preferences: {
          homeLayout: currentLayout,
          onboarding: updatedOnboarding,
        },
      });

      setLiveAnnouncement('Tutorial skipped. Welcome to Daynori.');
      onClose();
    } catch {
      // Allow closing even if preference persistence is offline
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }, [csrfToken, onClose]);

  const handleFinish = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    const client = createWebApiClient({ csrfToken });
    let currentOnboarding = getDefaultOnboardingState();
    let currentLayout = getDefaultHomeLayout();
    try {
      const prefRes = await client.getUserPreferences();
      if (prefRes?.data?.preferences?.onboarding) {
        currentOnboarding = prefRes.data.preferences.onboarding as OnboardingState;
      }
      if (prefRes?.data?.preferences?.homeLayout) {
        currentLayout = prefRes.data.preferences.homeLayout as HomeLayout;
      }
    } catch {
      // Fall back gracefully
    }

    const createdItemIds = [...(currentOnboarding.createdSampleItemIds || [])];
    let createdFolderId = currentOnboarding.createdFolderId || null;

    try {
      if (workspaceId && user?.id && !isReplay) {
        // 1. Create sample folder if opted in and not already created
        if (createStarterFolder && !createdFolderId) {
          try {
            const sampleFolderId = getSampleFolderId(workspaceId, user.id);
            const folderRes = await client.createFolder(workspaceId, {
              id: sampleFolderId,
              name: SAMPLE_STARTER_TEMPLATE.folderName,
              securityScope: 'standard',
            });
            if (folderRes.data?.id) {
              createdFolderId = folderRes.data.id;
            }
          } catch (err) {
            console.warn('[Onboarding] Starter folder creation skipped/failed:', err);
          }
        }

        // 2. Create sample note if opted in
        const sampleNoteId = getSampleNoteId(workspaceId, user.id);
        if (createStarterNote && !createdItemIds.includes(sampleNoteId)) {
          try {
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
          } catch (err) {
            console.warn('[Onboarding] Starter note creation skipped/failed:', err);
          }
        }

        // 3. Create sample task if opted in
        const sampleTaskId = getSampleTaskId(workspaceId, user.id);
        if (createStarterTask && !createdItemIds.includes(sampleTaskId)) {
          try {
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
          } catch (err) {
            console.warn('[Onboarding] Starter task creation skipped/failed:', err);
          }
        }
      }

      // 4. Personalize home layout shortcuts based on chosen interests
      const updatedLayout = deriveModuleShortcutsFromInterests(selectedInterests, currentLayout);

      // 5. Complete onboarding state
      const updatedOnboarding: OnboardingState = {
        ...completeOnboarding(currentOnboarding),
        selectedInterests,
        createdSampleItemIds: createdItemIds,
        createdFolderId,
      };

      await client.updateUserPreferences({
        preferences: {
          homeLayout: updatedLayout,
          onboarding: updatedOnboarding,
        },
      });

      setLiveAnnouncement('Tutorial completed! Welcome to your Daynori workspace.');
      onClose();
    } catch (err: unknown) {
      console.warn('[Onboarding] Finish error:', err);
      // Non-blocking completion
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
                          backgroundColor: isSelected
                            ? palette.surfaceRaised
                            : palette.surface,
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
              ℹ️ Visibility changes presentation shortcuts only. All core features remain authorized and
              accessible at any time.
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
                  Single deadlines, action items, and project checklists. Once marked complete, a task
                  is finished and won't reappear automatically.
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
              💡 Reminders are scheduled per item. Notification permissions are requested only when you
              explicitly add a reminder.
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
                  <span>Create initial folder: <strong>{SAMPLE_STARTER_TEMPLATE.folderName}</strong></span>
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
                  <span>Create sample note: <em>{SAMPLE_STARTER_TEMPLATE.noteTitle}</em></span>
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
                  <span>Create sample task: <em>{SAMPLE_STARTER_TEMPLATE.taskTitle}</em></span>
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
              🔒 Samples are clearly labeled and completely removable. We never silently populate your
              workspace.
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
