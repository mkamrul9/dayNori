import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import {
  UpdatePreferencesRequestSchema,
  ProfileResponseSchema,
  type ProfileResponse,
  type QuietHoursPreference,
  type HomeLayout,
  type OnboardingState,
} from '@daynori/contracts';
import { validateIanaTimeZone, validateLocale, validateWeekStart } from '@daynori/domain';
import { withUserContext, getProfile, updateProfilePreferences } from '../../db/index.js';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  validateResponse,
} from '../../plugins/errorHandler.js';

export function registerUserRoutes(app: FastifyInstance, runtimePool: Pool): void {
  // GET /v1/users/me/preferences — Retrieve actor's profile and preferences
  app.get('/v1/users/me/preferences', async (request, reply): Promise<ProfileResponse> => {
    const actor = request.actor!;

    const profile = await withUserContext(runtimePool, actor.userId, async (client) => {
      return getProfile(client, actor.userId);
    });

    if (!profile) {
      throw new NotFoundError(
        'User profile not found. Workspace may require initial provisioning.'
      );
    }

    const payload: ProfileResponse = {
      data: {
        id: profile.id,
        displayName: profile.display_name,
        preferredLocale: profile.preferred_locale,
        timeZone: profile.time_zone,
        weekStart: profile.week_start,
        preferences: {
          theme: profile.preferences?.theme || 'system',
          compactMode: Boolean(profile.preferences?.compactMode),
          journalPreviewHidden: profile.preferences?.journalPreviewHidden !== false,
          suppressBodySnippets: profile.preferences?.suppressBodySnippets !== false,
          quietHours: (profile.preferences?.quietHours as QuietHoursPreference | undefined) || undefined,
          homeLayout: (profile.preferences?.homeLayout as HomeLayout | undefined) || undefined,
          onboarding: (profile.preferences?.onboarding as OnboardingState | undefined) || undefined,
        },
        preferencesSchemaVersion: profile.preferences_schema_version,
        revision: Number(profile.revision),
        createdAt: profile.created_at.toISOString(),
        updatedAt: profile.updated_at.toISOString(),
      },
      meta: {
        requestId: request.id,
        serverTime: new Date().toISOString(),
      },
    };

    return reply.status(200).send(validateResponse(ProfileResponseSchema, payload));
  });

  // PATCH /v1/users/me/preferences — Update actor's preferences with revision concurrency control
  app.patch('/v1/users/me/preferences', async (request, reply): Promise<ProfileResponse> => {
    const actor = request.actor!;
    const body = UpdatePreferencesRequestSchema.parse(request.body);

    // Validate domain invariants
    if (body.timeZone !== undefined) {
      try {
        validateIanaTimeZone(body.timeZone);
      } catch (err) {
        throw new ValidationError(err instanceof Error ? err.message : 'Invalid time zone');
      }
    }

    if (body.preferredLocale !== undefined) {
      try {
        validateLocale(body.preferredLocale);
      } catch (err) {
        throw new ValidationError(err instanceof Error ? err.message : 'Invalid locale');
      }
    }

    if (body.weekStart !== undefined) {
      try {
        validateWeekStart(body.weekStart);
      } catch (err) {
        throw new ValidationError(err instanceof Error ? err.message : 'Invalid week start');
      }
    }

    const result = await withUserContext(runtimePool, actor.userId, async (client) => {
      return updateProfilePreferences(client, {
        userId: actor.userId,
        displayName: body.displayName,
        preferredLocale: body.preferredLocale,
        timeZone: body.timeZone,
        weekStart: body.weekStart,
        preferences: body.preferences,
        expectedRevision: body.expectedRevision,
      });
    });

    if (result.conflict) {
      throw new ConflictError(
        `Preference revision conflict. Current revision is ${result.currentRevision}, but expected ${body.expectedRevision}. Please refresh and reapply changes.`
      );
    }

    const profile = result.profile;
    const payload: ProfileResponse = {
      data: {
        id: profile.id,
        displayName: profile.display_name,
        preferredLocale: profile.preferred_locale,
        timeZone: profile.time_zone,
        weekStart: profile.week_start,
        preferences: {
          theme: profile.preferences?.theme || 'system',
          compactMode: Boolean(profile.preferences?.compactMode),
          journalPreviewHidden: profile.preferences?.journalPreviewHidden !== false,
          suppressBodySnippets: profile.preferences?.suppressBodySnippets !== false,
          quietHours: (profile.preferences?.quietHours as QuietHoursPreference | undefined) || undefined,
          homeLayout: (profile.preferences?.homeLayout as HomeLayout | undefined) || undefined,
          onboarding: (profile.preferences?.onboarding as OnboardingState | undefined) || undefined,
        },
        preferencesSchemaVersion: profile.preferences_schema_version,
        revision: Number(profile.revision),
        createdAt: profile.created_at.toISOString(),
        updatedAt: profile.updated_at.toISOString(),
      },
      meta: {
        requestId: request.id,
        serverTime: new Date().toISOString(),
      },
    };

    return reply.status(200).send(validateResponse(ProfileResponseSchema, payload));
  });
}
