import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';
import { WorkspaceSchema } from './workspace.js';

export const WeekStartSchema = z.enum(['monday', 'sunday', 'saturday']);
export type WeekStart = z.infer<typeof WeekStartSchema>;

export const ThemePreferenceSchema = z.enum(['system', 'light', 'dark']);
export type ThemePreference = z.infer<typeof ThemePreferenceSchema>;

export const QuietHoursPreferenceSchema = z
  .object({
    enabled: z.boolean().default(false),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('22:00'),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('08:00'),
    timezone: z.string().min(1).max(64).default('UTC'),
  })
  .strict();
export type QuietHoursPreference = z.infer<typeof QuietHoursPreferenceSchema>;

export const HomeWidgetIdSchema = z.enum([
  'tasks',
  'routines',
  'upcoming_summary',
  'quick_capture',
  'journal_prompt',
  'recent_items',
  'favorite_folders',
]);
export type HomeWidgetId = z.infer<typeof HomeWidgetIdSchema>;

export const HomeWidgetConfigSchema = z
  .object({
    id: HomeWidgetIdSchema,
    visible: z.boolean(),
    order: z.number().int().nonnegative(),
    customLabel: z.string().max(40).nullable().optional(),
  })
  .strict();
export type HomeWidgetConfig = z.infer<typeof HomeWidgetConfigSchema>;

export const ModuleShortcutIdSchema = z.enum([
  'today',
  'plan',
  'library',
  'journal',
  'notes',
  'tasks',
  'routines',
  'calendar',
  'files',
  'knowledge',
]);
export type ModuleShortcutId = z.infer<typeof ModuleShortcutIdSchema>;

export const ModuleShortcutConfigSchema = z
  .object({
    id: ModuleShortcutIdSchema,
    visible: z.boolean(),
    order: z.number().int().nonnegative(),
    customLabel: z.string().max(40).nullable().optional(),
  })
  .strict();
export type ModuleShortcutConfig = z.infer<typeof ModuleShortcutConfigSchema>;

export const HomeLayoutSchema = z
  .object({
    version: z.literal(1).default(1),
    density: z.enum(['comfortable', 'compact']).default('comfortable'),
    widgets: z.array(HomeWidgetConfigSchema).max(7),
    moduleShortcuts: z.array(ModuleShortcutConfigSchema).max(10),
    favoriteFolderIds: z.array(z.string().uuid()).max(20).default([]),
    unsupportedVersion: z.number().int().optional(),
  })
  .strict();
export type HomeLayout = z.infer<typeof HomeLayoutSchema>;

export const OnboardingInterestSchema = z.enum(['notes', 'planning', 'journal', 'files']);
export type OnboardingInterest = z.infer<typeof OnboardingInterestSchema>;

export const OnboardingStepSchema = z.enum(['capture', 'planning', 'organize', 'completed']);
export type OnboardingStep = z.infer<typeof OnboardingStepSchema>;

export const OnboardingStateSchema = z
  .object({
    version: z.literal(1).default(1),
    step: OnboardingStepSchema.default('capture'),
    completed: z.boolean().default(false),
    completedAt: z.string().datetime().nullable().optional(),
    skipped: z.boolean().default(false),
    skippedAt: z.string().datetime().nullable().optional(),
    selectedInterests: z
      .array(OnboardingInterestSchema)
      .default(['notes', 'planning', 'journal', 'files']),
    createdSampleItemIds: z.array(z.string().uuid()).default([]),
    createdFolderId: z.string().uuid().nullable().optional(),
  })
  .strict();
export type OnboardingState = z.infer<typeof OnboardingStateSchema>;

/**
 * Phase 66 — personal feature visibility and pins (user profile preference).
 * Never encodes release capability or operator authority.
 */
export const FeaturePersonalizationSchema = z
  .object({
    version: z.literal(1).default(1),
    hiddenFeatureIds: z.array(z.string().min(1).max(64)).max(40).default([]),
    pinnedFeatureIds: z.array(z.string().min(1).max(64)).max(20).default([]),
  })
  .strict();
export type FeaturePersonalization = z.infer<typeof FeaturePersonalizationSchema>;

/** Phase 79 — bounded tour progress (IDs/refs only; no private bodies). */
export const TourStepOutcomeSchema = z.enum(['completed', 'skipped', 'blocked', 'unfinished']);
export const TourChapterLifecycleSchema = z.enum([
  'not_started',
  'active',
  'paused',
  'completed',
  'skipped',
  'blocked',
]);

export const TourStepRecordSchema = z
  .object({
    stepId: z.string().min(1).max(128),
    outcome: TourStepOutcomeSchema,
    completedAt: z.string().datetime().nullable().optional(),
    skippedAt: z.string().datetime().nullable().optional(),
    operationId: z.string().min(1).max(128).nullable().optional(),
    entityId: z.string().min(1).max(128).nullable().optional(),
    attemptId: z.string().min(1).max(128).nullable().optional(),
  })
  .strict();

export const TourChapterProgressSchema = z
  .object({
    chapterId: z.string().min(1).max(128),
    definitionVersion: z.number().int().positive(),
    contentVersion: z.number().int().positive(),
    lifecycle: TourChapterLifecycleSchema,
    currentStepId: z.string().min(1).max(128).nullable(),
    runId: z.string().min(1).max(128).nullable(),
    steps: z.array(TourStepRecordSchema).max(40),
    practiceEntityIds: z.array(z.string().min(1).max(128)).max(20),
    updatedAt: z.string().datetime(),
    blockedReason: z.string().max(512).nullable().optional(),
  })
  .strict();

export const TourProgressStateSchema = z
  .object({
    version: z.literal(1).default(1),
    chapters: z.array(TourChapterProgressSchema).max(40).default([]),
    migratedFromOnboardingV1: z.boolean().default(false),
    migratedAt: z.string().datetime().nullable().optional(),
  })
  .strict();
export type TourProgressState = z.infer<typeof TourProgressStateSchema>;

export const DisplayPreferencesSchema = z
  .object({
    theme: ThemePreferenceSchema.default('system'),
    compactMode: z.boolean().default(false),
    journalPreviewHidden: z.boolean().default(true),
    suppressBodySnippets: z.boolean().default(true),
    quietHours: QuietHoursPreferenceSchema.optional(),
    homeLayout: HomeLayoutSchema.optional(),
    onboarding: OnboardingStateSchema.optional(),
    tourProgress: TourProgressStateSchema.optional(),
    expensesEnabled: z.boolean().default(false),
    featurePersonalization: FeaturePersonalizationSchema.optional(),
  })
  .strict();
export type DisplayPreferences = z.infer<typeof DisplayPreferencesSchema>;

export const ProfileSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1).max(64),
  preferredLocale: z.string().min(2).max(35),
  timeZone: z.string().min(1).max(64),
  weekStart: WeekStartSchema,
  preferences: DisplayPreferencesSchema,
  preferencesSchemaVersion: z.number().int().positive(),
  revision: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const UpdatePreferencesRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(64).optional(),
    preferredLocale: z.string().trim().min(2).max(35).optional(),
    timeZone: z.string().trim().min(1).max(64).optional(),
    weekStart: WeekStartSchema.optional(),
    preferences: DisplayPreferencesSchema.partial().optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
export type UpdatePreferencesRequest = z.infer<typeof UpdatePreferencesRequestSchema>;

export const ProvisionWorkspaceRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(64).optional(),
    preferredLocale: z.string().trim().min(2).max(35).optional(),
    timeZone: z.string().trim().min(1).max(64).optional(),
    weekStart: WeekStartSchema.optional(),
  })
  .strict()
  .optional();
export type ProvisionWorkspaceRequest = z.infer<typeof ProvisionWorkspaceRequestSchema>;

export const ProvisionWorkspaceResponseSchema = z.object({
  data: z.object({
    workspace: WorkspaceSchema,
    profile: ProfileSchema,
    isNew: z.boolean(),
  }),
  meta: ResponseMetaSchema,
});
export type ProvisionWorkspaceResponse = z.infer<typeof ProvisionWorkspaceResponseSchema>;

export const ProfileResponseSchema = z.object({
  data: ProfileSchema,
  meta: ResponseMetaSchema,
});
export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;
