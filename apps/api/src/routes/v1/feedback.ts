import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  CreateFeedbackReportRequestSchema,
  FeedbackReportListResponseSchema,
  FeedbackReportResponseSchema,
} from '@daynori/contracts';
import { withTenantContext } from '../../db/index.js';
import { NotFoundError, ValidationError, validateResponse } from '../../plugins/errorHandler.js';
import {
  FeedbackServiceError,
  createFeedbackReport,
  getFeedbackReport,
  listFeedbackReports,
} from '../../modules/feedback/service.js';

function meta(requestId: string) {
  return { requestId, serverTime: new Date().toISOString() };
}

function sendFeedbackError(
  err: unknown,
  reply: { status: (n: number) => { send: (b: unknown) => unknown } }
) {
  if (err instanceof FeedbackServiceError) {
    return reply.status(err.statusCode).send({
      error: { message: err.message, code: err.code },
    });
  }
  if (err instanceof NotFoundError || err instanceof ValidationError) {
    throw err;
  }
  throw err;
}

const WorkspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const ReportParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  reportId: z.string().uuid(),
});

export function registerFeedbackRoutes(app: FastifyInstance, pool: Pool): void {
  // POST /v1/workspaces/:workspaceId/feedback/reports
  app.post(
    '/v1/workspaces/:workspaceId/feedback/reports',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });

      const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
      const body = CreateFeedbackReportRequestSchema.parse(request.body);

      try {
        const result = await withTenantContext(
          pool,
          { userId: actor.userId, workspaceId },
          (client) =>
            createFeedbackReport(client, {
              reporterId: actor.userId,
              workspaceId,
              clientReportId: body.clientReportId,
              reportType: body.reportType,
              category: body.category,
              summary: body.summary,
              description: body.description,
              stepsToReproduce: body.stepsToReproduce,
              expectedBehavior: body.expectedBehavior,
              actualBehavior: body.actualBehavior,
              frequency: body.frequency,
              severity: body.severity,
              replyEmail: body.replyEmail,
              includeDiagnostics: body.includeDiagnostics,
              diagnostics: body.diagnostics,
              attachments: body.attachments,
            })
        );

        return reply.status(result.isReplay ? 200 : 201).send(
          validateResponse(FeedbackReportResponseSchema, {
            data: result.receipt,
            meta: meta(request.id),
          })
        );
      } catch (err) {
        return sendFeedbackError(err, reply);
      }
    }
  );

  // GET /v1/workspaces/:workspaceId/feedback/reports
  app.get(
    '/v1/workspaces/:workspaceId/feedback/reports',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });

      const { workspaceId } = WorkspaceParamsSchema.parse(request.params);

      try {
        const reports = await withTenantContext(
          pool,
          { userId: actor.userId, workspaceId },
          (client) =>
            listFeedbackReports(client, {
              reporterId: actor.userId,
              workspaceId,
            })
        );

        return reply.send(
          validateResponse(FeedbackReportListResponseSchema, {
            data: reports,
            meta: meta(request.id),
          })
        );
      } catch (err) {
        return sendFeedbackError(err, reply);
      }
    }
  );

  // GET /v1/workspaces/:workspaceId/feedback/reports/:reportId
  app.get(
    '/v1/workspaces/:workspaceId/feedback/reports/:reportId',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });

      const { workspaceId, reportId } = ReportParamsSchema.parse(request.params);

      try {
        const report = await withTenantContext(
          pool,
          { userId: actor.userId, workspaceId },
          (client) =>
            getFeedbackReport(client, {
              reportId,
              reporterId: actor.userId,
              workspaceId,
            })
        );

        return reply.send(
          validateResponse(FeedbackReportResponseSchema, {
            data: report,
            meta: meta(request.id),
          })
        );
      } catch (err) {
        return sendFeedbackError(err, reply);
      }
    }
  );
}
