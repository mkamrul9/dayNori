import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';
import { WorkspaceSchema } from './workspace.js';

export const WeekStartSchema = z.enum(['monday', 'sunday', 'saturday']);
export type WeekStart = z.infer<typeof WeekStartSchema>;

export const ThemePreferenceSchema = z.enum(['system', 'light', 'dark']);
export type ThemePreference = z.infer<typeof ThemePreferenceSchema>;

export const DisplayPreferencesSchema = z
  .object({
    theme: ThemePreferenceSchema.default('system'),
    compactMode: z.boolean().default(false),
    journalPreviewHidden: z.boolean().default(true),
    suppressBodySnippets: z.boolean().default(true),
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
    preferences: DisplayPreferencesSchema.optional(),
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
