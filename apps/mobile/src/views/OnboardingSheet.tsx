import React, { useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import { MobileButton, MobileCard, MobileModalSheet } from '@daynori/ui-mobile';
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
  getDefaultHomeLayout,
  type OnboardingInterest,
  type OnboardingStep,
  type OnboardingState,
  type HomeLayout,
} from '@daynori/domain';
import type { DaynoriApiClient } from '@daynori/api-client';
import type { LocalRepositoryPort } from '@daynori/sync';

export interface OnboardingSheetProps {
  visible: boolean;
  onClose: () => void;
  themeMode: ThemeMode;
  apiClient?: DaynoriApiClient;
  repository?: LocalRepositoryPort;
  workspaceId?: string | null;
  userId?: string | null;
  isReplay?: boolean;
  testID?: string;
  onComplete?: () => void;
}

export const OnboardingSheet: React.FC<OnboardingSheetProps> = ({
  visible,
  onClose,
  themeMode,
  apiClient,
  workspaceId,
  userId,
  isReplay = false,
  testID = 'onboarding-sheet',
  onComplete,
}) => {
  const palette = colors[themeMode];

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

  const currentStep: OnboardingStep = TUTORIAL_STEPS[currentStepIndex] || 'capture';
  const meta = ONBOARDING_STEP_METADATA[currentStep];

  // Announce step transitions to screen readers (TalkBack)
  useEffect(() => {
    if (visible && meta?.announcement) {
      AccessibilityInfo.announceForAccessibility?.(meta.announcement);
    }
  }, [visible, currentStepIndex, meta?.announcement]);

  // Reset state on open
  useEffect(() => {
    if (visible) {
      setCurrentStepIndex(0);
      setErrorMessage(null);
    }
  }, [visible]);

  const handleInterestToggle = (interest: OnboardingInterest) => {
    setSelectedInterests((prev) => {
      if (prev.includes(interest)) {
        if (prev.length === 1) return prev; // Keep at least one
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
      let currentOnboarding = getDefaultOnboardingState();
      let currentLayout = getDefaultHomeLayout();

      if (apiClient) {
        try {
          const prefRes = await apiClient.getUserPreferences();
          if (prefRes?.data?.preferences?.onboarding) {
            currentOnboarding = prefRes.data.preferences.onboarding as OnboardingState;
          }
          if (prefRes?.data?.preferences?.homeLayout) {
            currentLayout = prefRes.data.preferences.homeLayout as HomeLayout;
          }
        } catch {
          // Fall back gracefully
        }
      }

      const updatedOnboarding = skipOnboarding(currentOnboarding);

      if (apiClient) {
        try {
          await apiClient.updateUserPreferences({
            preferences: {
              homeLayout: currentLayout,
              onboarding: updatedOnboarding,
            },
          });
        } catch {
          // Ignore offline errors
        }
      }

      AccessibilityInfo.announceForAccessibility?.('Tutorial skipped. Welcome to Daynori.');
      onComplete?.();
      onClose();
    } catch {
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }, [apiClient, onComplete, onClose]);

  const handleFinish = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    let currentOnboarding = getDefaultOnboardingState();
    let currentLayout = getDefaultHomeLayout();

    if (apiClient) {
      try {
        const prefRes = await apiClient.getUserPreferences();
        if (prefRes?.data?.preferences?.onboarding) {
          currentOnboarding = prefRes.data.preferences.onboarding as OnboardingState;
        }
        if (prefRes?.data?.preferences?.homeLayout) {
          currentLayout = prefRes.data.preferences.homeLayout as HomeLayout;
        }
      } catch {
        // Fall back gracefully
      }
    }

    const createdItemIds = [...(currentOnboarding.createdSampleItemIds || [])];
    let createdFolderId = currentOnboarding.createdFolderId || null;

    try {
      if (workspaceId && userId && apiClient && !isReplay) {
        // 1. Create starter folder if selected and not yet created
        if (createStarterFolder && !createdFolderId) {
          try {
            const sampleFolderId = getSampleFolderId(workspaceId, userId);
            const folderRes = await apiClient.createFolder(workspaceId, {
              id: sampleFolderId,
              name: SAMPLE_STARTER_TEMPLATE.folderName,
              securityScope: 'standard',
            });
            if (folderRes.data?.id) {
              createdFolderId = folderRes.data.id;
            }
          } catch (err) {
            console.warn('[Onboarding] Starter folder creation skipped:', err);
          }
        }

        // 2. Create sample note if selected
        const sampleNoteId = getSampleNoteId(workspaceId, userId);
        if (createStarterNote && !createdItemIds.includes(sampleNoteId)) {
          try {
            await apiClient.createNote(workspaceId, {
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
            console.warn('[Onboarding] Starter note creation skipped:', err);
          }
        }

        // 3. Create sample task if selected
        const sampleTaskId = getSampleTaskId(workspaceId, userId);
        if (createStarterTask && !createdItemIds.includes(sampleTaskId)) {
          try {
            await apiClient.createTask(workspaceId, {
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
            console.warn('[Onboarding] Starter task creation skipped:', err);
          }
        }
      }

      // 4. Personalize home layout module shortcuts based on selected interests
      const updatedLayout = deriveModuleShortcutsFromInterests(selectedInterests, currentLayout);

      // 5. Complete onboarding state
      const updatedOnboarding: OnboardingState = {
        ...completeOnboarding(currentOnboarding),
        selectedInterests,
        createdSampleItemIds: createdItemIds,
        createdFolderId,
      };

      if (apiClient) {
        try {
          await apiClient.updateUserPreferences({
            preferences: {
              homeLayout: updatedLayout,
              onboarding: updatedOnboarding,
            },
          });
        } catch {
          // Ignore offline errors
        }
      }

      AccessibilityInfo.announceForAccessibility?.('Tutorial completed. Welcome to Daynori!');
      onComplete?.();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to complete setup.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MobileModalSheet
      visible={visible}
      onClose={onClose}
      title={meta ? `Step ${currentStepIndex + 1} of ${TUTORIAL_STEPS.length}` : 'Getting Started'}
      themeMode={themeMode}
      testID={testID}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Progress Bar */}
        <View style={[styles.progressTrack, { backgroundColor: palette.surface }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${((currentStepIndex + 1) / TUTORIAL_STEPS.length) * 100}%`,
                backgroundColor: palette.action.primary,
              },
            ]}
          />
        </View>

        {/* Step Header */}
        <View style={styles.headerContainer}>
          <Text
            accessibilityRole="header"
            style={[styles.stepTitle, { color: palette.text.primary }]}
          >
            {meta.title}
          </Text>
          <Text style={[styles.stepSubtitle, { color: palette.text.secondary }]}>
            {meta.description}
          </Text>
        </View>

        {/* Step 1: Capture & Focus (Interest Selection) */}
        {currentStep === 'capture' && (
          <View style={styles.stepContent}>
            <Text style={[styles.sectionHeading, { color: palette.text.primary }]}>
              What will you use Daynori for?
            </Text>
            <Text style={[styles.bodyText, { color: palette.text.secondary }]}>
              Choose your primary interests to tailor your Home shortcuts. All features remain
              available anytime in the full menu.
            </Text>

            <View style={styles.interestList}>
              {(['notes', 'planning', 'journal', 'files'] as OnboardingInterest[]).map(
                (interest) => {
                  const isChecked = selectedInterests.includes(interest);
                  const label = ONBOARDING_INTEREST_LABELS[interest];
                  return (
                    <Pressable
                      key={interest}
                      testID={`interest-toggle-${interest}`}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isChecked }}
                      accessibilityLabel={`${label.label}: ${label.description}`}
                      onPress={() => handleInterestToggle(interest)}
                      style={[
                        styles.interestCard,
                        {
                          backgroundColor: isChecked ? palette.surface : palette.background,
                          borderColor: isChecked ? palette.action.primary : palette.border.subtle,
                        },
                      ]}
                    >
                      <View style={styles.checkboxRow}>
                        <View
                          style={[
                            styles.checkboxBox,
                            {
                              borderColor: isChecked
                                ? palette.action.primary
                                : palette.border.strong,
                              backgroundColor: isChecked ? palette.action.primary : 'transparent',
                            },
                          ]}
                        >
                          {isChecked && (
                            <Text style={[styles.checkIcon, { color: palette.action.label }]}>
                              ✓
                            </Text>
                          )}
                        </View>
                        <View style={styles.interestTextContainer}>
                          <Text
                            style={[
                              styles.interestTitle,
                              {
                                color: isChecked ? palette.text.primary : palette.text.secondary,
                              },
                            ]}
                          >
                            {label.label}
                          </Text>
                          <Text style={[styles.interestDesc, { color: palette.text.secondary }]}>
                            {label.description}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                }
              )}
            </View>

            <View
              style={[
                styles.noticeBanner,
                { backgroundColor: palette.surface, borderColor: palette.border.subtle },
              ]}
            >
              <Text style={[styles.noticeText, { color: palette.text.secondary }]}>
                🔒 <Text style={{ fontWeight: '600' }}>Transparency Notice:</Text> Selecting
                interests only adjusts shortcut visibility on your Home screen. It never restricts
                data access or feature availability.
              </Text>
            </View>
          </View>
        )}

        {/* Step 2: Planning (Tasks vs Routines & Progressive Discovery) */}
        {currentStep === 'planning' && (
          <View style={styles.stepContent}>
            <Text style={[styles.sectionHeading, { color: palette.text.primary }]}>
              Understanding Tasks vs. Routines
            </Text>
            <Text style={[styles.bodyText, { color: palette.text.secondary }]}>
              Daynori separates one-time deadlines from repeating daily habits to keep your planner
              calm and guilt-free.
            </Text>

            <View style={styles.comparisonCards}>
              <View testID="card-tasks-explanation">
                <MobileCard themeMode={themeMode}>
                  <Text style={[styles.cardTitle, { color: palette.text.primary }]}>
                    📋 Upcoming Tasks
                  </Text>
                  <Text style={[styles.cardBody, { color: palette.text.secondary }]}>
                    One-time actionable items with deadlines or flexible target dates. Completed
                    tasks are marked done and archived.
                  </Text>
                </MobileCard>
              </View>

              <View testID="card-routines-explanation">
                <MobileCard themeMode={themeMode}>
                  <Text style={[styles.cardTitle, { color: palette.text.primary }]}>
                    🔁 Daily Routines
                  </Text>
                  <Text style={[styles.cardBody, { color: palette.text.secondary }]}>
                    Recurring daily rhythms (morning reflection, review sessions). Each day
                    generates a fresh instance without carrying overdue backlog baggage.
                  </Text>
                </MobileCard>
              </View>
            </View>

            <View
              style={[
                styles.noticeBanner,
                { backgroundColor: palette.surface, borderColor: palette.border.subtle },
              ]}
            >
              <Text style={[styles.noticeText, { color: palette.text.secondary }]}>
                🛡️ <Text style={{ fontWeight: '600' }}>Contextual Permissions:</Text> We do not
                ask for camera, microphone, or push notification access right now. You will be
                prompted only when you deliberately use those tools.
              </Text>
            </View>
          </View>
        )}

        {/* Step 3: Organize (Starter Items & Opt-in Sample Content) */}
        {currentStep === 'organize' && (
          <View style={styles.stepContent}>
            <Text style={[styles.sectionHeading, { color: palette.text.primary }]}>
              Starter Examples
            </Text>
            <Text style={[styles.bodyText, { color: palette.text.secondary }]}>
              Would you like sample items to help explore your new workspace? You can edit, archive,
              or delete them at any time.
            </Text>

            <View style={styles.sampleToggles}>
              <Pressable
                testID="toggle-starter-folder"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: createStarterFolder }}
                accessibilityLabel="Create starter folder: Personal Starter"
                onPress={() => setCreateStarterFolder((v) => !v)}
                style={[
                  styles.sampleRow,
                  {
                    backgroundColor: createStarterFolder ? palette.surface : palette.background,
                    borderColor: createStarterFolder
                      ? palette.action.primary
                      : palette.border.subtle,
                  },
                ]}
              >
                <View
                  style={[
                    styles.checkboxBox,
                    {
                      borderColor: createStarterFolder
                        ? palette.action.primary
                        : palette.border.strong,
                      backgroundColor: createStarterFolder
                        ? palette.action.primary
                        : 'transparent',
                    },
                  ]}
                >
                  {createStarterFolder && (
                    <Text style={[styles.checkIcon, { color: palette.action.label }]}>✓</Text>
                  )}
                </View>
                <View style={styles.sampleTextContainer}>
                  <Text style={[styles.sampleTitle, { color: palette.text.primary }]}>
                    📁 Starter Folder: &ldquo;{SAMPLE_STARTER_TEMPLATE.folderName}&rdquo;
                  </Text>
                  <Text style={[styles.sampleDesc, { color: palette.text.secondary }]}>
                    Organize your first notes, tasks, and files.
                  </Text>
                </View>
              </Pressable>

              <Pressable
                testID="toggle-starter-note"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: createStarterNote }}
                accessibilityLabel="Create starter note: Welcome Guide"
                onPress={() => setCreateStarterNote((v) => !v)}
                style={[
                  styles.sampleRow,
                  {
                    backgroundColor: createStarterNote ? palette.surface : palette.background,
                    borderColor: createStarterNote
                      ? palette.action.primary
                      : palette.border.subtle,
                  },
                ]}
              >
                <View
                  style={[
                    styles.checkboxBox,
                    {
                      borderColor: createStarterNote
                        ? palette.action.primary
                        : palette.border.strong,
                      backgroundColor: createStarterNote ? palette.action.primary : 'transparent',
                    },
                  ]}
                >
                  {createStarterNote && (
                    <Text style={[styles.checkIcon, { color: palette.action.label }]}>✓</Text>
                  )}
                </View>
                <View style={styles.sampleTextContainer}>
                  <Text style={[styles.sampleTitle, { color: palette.text.primary }]}>
                    📝 Welcome Note: &ldquo;{SAMPLE_STARTER_TEMPLATE.noteTitle}&rdquo;
                  </Text>
                  <Text style={[styles.sampleDesc, { color: palette.text.secondary }]}>
                    A quick reference guide to shortcuts, offline sync, and private journaling.
                  </Text>
                </View>
              </Pressable>

              <Pressable
                testID="toggle-starter-task"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: createStarterTask }}
                accessibilityLabel="Create starter task: Explore Daynori Today dashboard"
                onPress={() => setCreateStarterTask((v) => !v)}
                style={[
                  styles.sampleRow,
                  {
                    backgroundColor: createStarterTask ? palette.surface : palette.background,
                    borderColor: createStarterTask
                      ? palette.action.primary
                      : palette.border.subtle,
                  },
                ]}
              >
                <View
                  style={[
                    styles.checkboxBox,
                    {
                      borderColor: createStarterTask
                        ? palette.action.primary
                        : palette.border.strong,
                      backgroundColor: createStarterTask ? palette.action.primary : 'transparent',
                    },
                  ]}
                >
                  {createStarterTask && (
                    <Text style={[styles.checkIcon, { color: palette.action.label }]}>✓</Text>
                  )}
                </View>
                <View style={styles.sampleTextContainer}>
                  <Text style={[styles.sampleTitle, { color: palette.text.primary }]}>
                    ✓ Sample Task: &ldquo;{SAMPLE_STARTER_TEMPLATE.taskTitle}&rdquo;
                  </Text>
                  <Text style={[styles.sampleDesc, { color: palette.text.secondary }]}>
                    Check off your first task on the Today dashboard.
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>
        )}

        {/* Error Feedback */}
        {errorMessage && (
          <View style={[styles.errorBox, { backgroundColor: palette.status.dangerBg }]}>
            <Text style={[styles.errorText, { color: palette.status.danger }]}>
              ⚠️ {errorMessage}
            </Text>
          </View>
        )}

        {/* Action Controls */}
        <View style={styles.actionsContainer}>
          <View style={styles.primaryNavRow}>
            {currentStepIndex > 0 ? (
              <MobileButton
                testID="btn-onboarding-back"
                variant="secondary"
                themeMode={themeMode}
                onPress={handleBack}
                accessibilityLabel="Go back to previous tutorial step"
              >
                &larr; Back
              </MobileButton>
            ) : (
              <MobileButton
                testID="btn-onboarding-skip"
                variant="subtle"
                themeMode={themeMode}
                onPress={handleSkip}
                accessibilityLabel="Skip onboarding tutorial and go to home"
              >
                Skip Tutorial
              </MobileButton>
            )}

            {currentStepIndex < TUTORIAL_STEPS.length - 1 ? (
              <MobileButton
                testID="btn-onboarding-next"
                variant="primary"
                themeMode={themeMode}
                onPress={handleNext}
                accessibilityLabel="Proceed to next tutorial step"
              >
                Next &rarr;
              </MobileButton>
            ) : (
              <MobileButton
                testID="btn-onboarding-finish"
                variant="primary"
                themeMode={themeMode}
                onPress={() => void handleFinish()}
                accessibilityLabel={
                  isReplay ? 'Save tutorial settings' : 'Finish tutorial and explore Daynori'
                }
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : isReplay ? (
                  'Finish Replay'
                ) : (
                  'Get Started ✨'
                )}
              </MobileButton>
            )}
          </View>

          {currentStepIndex > 0 && (
            <View style={styles.skipRow}>
              <MobileButton
                testID="btn-onboarding-skip-footer"
                variant="subtle"
                themeMode={themeMode}
                onPress={handleSkip}
                accessibilityLabel="Skip remaining steps and enter Daynori"
              >
                Skip remaining steps
              </MobileButton>
            </View>
          )}
        </View>
      </ScrollView>
    </MobileModalSheet>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  progressTrack: {
    height: 4,
    borderRadius: radii.pill,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  progressFill: {
    height: '100%',
    borderRadius: radii.pill,
  },
  headerContainer: {
    marginBottom: spacing.md,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  stepSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  stepContent: {
    marginBottom: spacing.md,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  interestList: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  interestCard: {
    borderWidth: 1.5,
    borderRadius: radii.card,
    padding: spacing.md,
    minHeight: touchTargets.mobileMin,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: radii.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkIcon: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 14,
  },
  interestTextContainer: {
    flex: 1,
  },
  interestTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  interestDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  noticeBanner: {
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  noticeText: {
    fontSize: 12,
    lineHeight: 16,
  },
  comparisonCards: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  sampleToggles: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderRadius: radii.card,
    padding: spacing.md,
    minHeight: touchTargets.mobileMin,
  },
  sampleTextContainer: {
    flex: 1,
  },
  sampleTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  sampleDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  errorBox: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
  },
  actionsContainer: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  primaryNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  skipRow: {
    alignItems: 'center',
    marginTop: spacing.xs,
  },
});
