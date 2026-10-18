import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import {
  WorkspaceParamsSchema,
  SearchQuerySchema,
  SearchResponseSchema,
  type SearchItemType,
} from '@daynori/contracts';
import { withTenantContext } from '../../db/index.js';
import { executeSearch } from '../../modules/search/service.js';
import { validateResponse, NotFoundError } from '../../plugins/errorHandler.js';

export function registerSearchRoutes(app: FastifyInstance, runtimePool: Pool) {
  app.get('/v1/workspaces/:workspaceId/search', async (request, reply) => {
    const actor = request.actor!;
    const params = WorkspaceParamsSchema.parse(request.params);

    const rawQuery = request.query as Record<string, unknown>;

    // Normalize array parameters that could arrive as single strings or arrays
    const typesRaw = rawQuery['types'];
    const types: SearchItemType[] | undefined = Array.isArray(typesRaw)
      ? (typesRaw as SearchItemType[])
      : typeof typesRaw === 'string'
        ? [typesRaw as SearchItemType]
        : undefined;

    const tagNamesRaw = rawQuery['tagNames'];
    const tagNames: string[] | undefined = Array.isArray(tagNamesRaw)
      ? (tagNamesRaw as string[])
      : typeof tagNamesRaw === 'string'
        ? [tagNamesRaw]
        : undefined;

    const parsedQuery = SearchQuerySchema.parse({
      q: typeof rawQuery['q'] === 'string' ? rawQuery['q'] : '',
      types,
      folderId: typeof rawQuery['folderId'] === 'string' ? rawQuery['folderId'] : undefined,
      tagNames,
      startDate: typeof rawQuery['startDate'] === 'string' ? rawQuery['startDate'] : undefined,
      endDate: typeof rawQuery['endDate'] === 'string' ? rawQuery['endDate'] : undefined,
      includeArchived:
        rawQuery['includeArchived'] === 'true' || rawQuery['includeArchived'] === true,
      limit: rawQuery['limit'] !== undefined ? rawQuery['limit'] : 20,
      offset: rawQuery['offset'] !== undefined ? rawQuery['offset'] : 0,
    });

    const searchResult = await withTenantContext(
      runtimePool,
      { userId: actor.userId, workspaceId: params.workspaceId },
      async (client) => {
        // Enforce workspace authorization before executing search or returning counts
        const auth = await client.query<{ has_access: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'viewer') as has_access;`,
          [params.workspaceId]
        );
        if (!auth.rows[0]?.has_access) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }

        return executeSearch(client, params.workspaceId, actor.userId, parsedQuery);
      }
    );

    const payload = {
      data: searchResult.data,
      meta: {
        totalCount: searchResult.totalCount,
        limit: parsedQuery.limit,
        offset: parsedQuery.offset,
        hasMore: parsedQuery.offset + searchResult.data.length < searchResult.totalCount,
        coverage: 'complete' as const,
        serverTime: new Date().toISOString(),
        requestId: request.id,
      },
    };

    return reply.status(200).send(validateResponse(SearchResponseSchema, payload));
  });
}
