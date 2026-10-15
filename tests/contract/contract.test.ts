import { describe, expect, it } from 'vitest';
import {
  HealthResponseSchema,
  SmokeResponseSchema,
  SyncPushRequestSchema,
  SyncPushResponseSchema,
  SyncPullResponseSchema,
  SyncBootstrapResponseSchema,
  generateCanonicalOpenApiSpec,
} from '@daynori/contracts';

describe('Cross-Workspace Contract Verification', () => {
  it('validates contract compatibility between API and client schemas', () => {
    const apiHealthSample = {
      status: 'ok',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      environment: 'development',
    };

    const validated = HealthResponseSchema.safeParse(apiHealthSample);
    expect(validated.success).toBe(true);
  });

  it('validates smoke route contract schema', () => {
    const apiSmokeSample = {
      status: 'ready',
      phase: '01',
      service: 'daynori-api',
      timestamp: new Date().toISOString(),
    };

    const validated = SmokeResponseSchema.safeParse(apiSmokeSample);
    expect(validated.success).toBe(true);
  });

  it('validates Phase 12 sync contract schemas', () => {
    const samplePush = {
      commands: [
        {
          operationId: '11111111-1111-4111-8111-111111111111',
          deviceId: 'device-test-1',
          workspaceId: '22222222-2222-4222-8222-222222222222',
          commandVersion: 1,
          schemaVersion: 1,
          command: 'createItem',
          entityType: 'item',
          entityId: '33333333-3333-4333-8333-333333333333',
          baseRevision: 0,
          dependencyOperationIds: [],
          clientTimestamp: new Date().toISOString(),
          payload: { kind: 'note' },
        },
      ],
    };

    const pushParsed = SyncPushRequestSchema.safeParse(samplePush);
    expect(pushParsed.success).toBe(true);

    const samplePushRes = {
      data: {
        results: [
          {
            operationId: '11111111-1111-4111-8111-111111111111',
            status: 'accepted',
            entityId: '33333333-3333-4333-8333-333333333333',
            revision: 1,
            seq: 1,
          },
        ],
      },
      meta: {
        requestId: 'req-1',
        serverTime: new Date().toISOString(),
      },
    };

    const pushResParsed = SyncPushResponseSchema.safeParse(samplePushRes);
    expect(pushResParsed.success).toBe(true);

    const samplePullRes = {
      data: {
        changes: [],
        nextCursor: 'cursor-token',
        hasMore: false,
        accessEpoch: 'epoch-1',
      },
      meta: {
        requestId: 'req-pull',
        serverTime: new Date().toISOString(),
      },
    };
    expect(SyncPullResponseSchema.safeParse(samplePullRes).success).toBe(true);

    const sampleBootstrapRes = {
      data: {
        items: [],
        watermarkCursor: 'cursor-wm',
        accessEpoch: 'epoch-1',
      },
      meta: {
        requestId: 'req-bs',
        serverTime: new Date().toISOString(),
      },
    };
    expect(SyncBootstrapResponseSchema.safeParse(sampleBootstrapRes).success).toBe(true);
  });

  it('verifies OpenAPI document has sync routes and components without drift', () => {
    const openapi = generateCanonicalOpenApiSpec() as {
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    };
    expect(openapi.paths['/v1/sync/push']).toBeDefined();
    expect(openapi.paths['/v1/sync/pull']).toBeDefined();
    expect(openapi.paths['/v1/sync/bootstrap']).toBeDefined();

    expect(openapi.components.schemas['SyncPushRequest']).toBeDefined();
    expect(openapi.components.schemas['SyncPushResponse']).toBeDefined();
    expect(openapi.components.schemas['SyncPullResponse']).toBeDefined();
    expect(openapi.components.schemas['SyncBootstrapResponse']).toBeDefined();
  });
});
