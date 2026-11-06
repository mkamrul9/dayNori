import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { isPlatformOperator } from '@daynori/domain';
import {
  FeedbackInternalNoteCreateSchema,
  FeedbackInternalNoteListResponseSchema,
  FeedbackInternalNoteSchema,
  FeedbackReportUpdateSchema,
  FeedbackRetentionPurgeRequestSchema,
  FeedbackRetentionPurgeResponseSchema,
  FeedbackTriageAuditListResponseSchema,
  FeedbackTriageListResponseSchema,
  FeedbackTriageQuerySchema,
  FeedbackTriageResponseSchema,
  ResponseMetaSchema,
} from '@daynori/contracts';
import { withOperatorContext } from '../../db/index.js';
import {
  ExplicitForbiddenError,
  NotFoundError,
  ValidationError,
  validateResponse,
} from '../../plugins/errorHandler.js';
import {
  FeedbackServiceError,
  addInternalNote,
  getTriageReport,
  listInternalNotes,
  listTriageAudit,
  listTriageReports,
  purgeExpiredReports,
  updateTriageReport,
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
  if (err instanceof NotFoundError || err instanceof ValidationError || err instanceof ExplicitForbiddenError) {
    throw err;
  }
  throw err;
}

function assertOperator(request: FastifyRequest) {
  const actor = request.actor;
  if (!actor) {
    throw new ValidationError('Authentication required');
  }
  const allowed = isPlatformOperator({ userId: actor.userId }, process.env);
  if (!allowed) {
    throw new ExplicitForbiddenError('Platform operator access required');
  }
  return actor;
}

const ReportParamsSchema = z.object({
  reportId: z.string().uuid(),
});

export function registerOperatorFeedbackRoutes(app: FastifyInstance, pool: Pool): void {
  // GET /v1/operator/feedback/reports - List feedback reports with bounded filters
  app.get('/v1/operator/feedback/reports', async (request: FastifyRequest, reply) => {
    const actor = assertOperator(request);
    const query = FeedbackTriageQuerySchema.parse(request.query);

    try {
      const result = await withOperatorContext(pool, actor.userId, (client) =>
        listTriageReports(client, query)
      );

      return reply.send(
        validateResponse(FeedbackTriageListResponseSchema, {
          data: result.data,
          pagination: result.pagination,
          meta: meta(request.id),
        })
      );
    } catch (err) {
      return sendFeedbackError(err, reply);
    }
  });

  // GET /v1/operator/feedback/reports/:reportId - Retrieve single report with operator details
  app.get('/v1/operator/feedback/reports/:reportId', async (request: FastifyRequest, reply) => {
    const actor = assertOperator(request);
    const { reportId } = ReportParamsSchema.parse(request.params);

    try {
      const result = await withOperatorContext(pool, actor.userId, (client) =>
        getTriageReport(client, reportId)
      );

      return reply.send(
        validateResponse(FeedbackTriageResponseSchema, {
          data: result,
          meta: meta(request.id),
        })
      );
    } catch (err) {
      return sendFeedbackError(err, reply);
    }
  });

  // PATCH /v1/operator/feedback/reports/:reportId - Update status, priority, assignment, duplicate link, or send response
  app.patch('/v1/operator/feedback/reports/:reportId', async (request: FastifyRequest, reply) => {
    const actor = assertOperator(request);
    const { reportId } = ReportParamsSchema.parse(request.params);
    const body = FeedbackReportUpdateSchema.parse(request.body);

    try {
      const result = await withOperatorContext(pool, actor.userId, (client) =>
        updateTriageReport(client, reportId, actor.userId, body)
      );

      return reply.send(
        validateResponse(FeedbackTriageResponseSchema, {
          data: result,
          meta: meta(request.id),
        })
      );
    } catch (err) {
      return sendFeedbackError(err, reply);
    }
  });

  // POST /v1/operator/feedback/reports/:reportId/notes - Add internal note
  app.post('/v1/operator/feedback/reports/:reportId/notes', async (request: FastifyRequest, reply) => {
    const actor = assertOperator(request);
    const { reportId } = ReportParamsSchema.parse(request.params);
    const body = FeedbackInternalNoteCreateSchema.parse(request.body);

    try {
      const result = await withOperatorContext(pool, actor.userId, (client) =>
        addInternalNote(client, reportId, actor.userId, body.note)
      );

      const SingleNoteResponseSchema = z.object({
        data: FeedbackInternalNoteSchema,
        meta: ResponseMetaSchema,
      });

      return reply.status(201).send(
        validateResponse(SingleNoteResponseSchema, {
          data: result,
          meta: meta(request.id),
        })
      );
    } catch (err) {
      return sendFeedbackError(err, reply);
    }
  });

  // GET /v1/operator/feedback/reports/:reportId/notes - List internal notes
  app.get('/v1/operator/feedback/reports/:reportId/notes', async (request: FastifyRequest, reply) => {
    const actor = assertOperator(request);
    const { reportId } = ReportParamsSchema.parse(request.params);

    try {
      const notes = await withOperatorContext(pool, actor.userId, (client) =>
        listInternalNotes(client, reportId)
      );

      return reply.send(
        validateResponse(FeedbackInternalNoteListResponseSchema, {
          data: notes,
          meta: meta(request.id),
        })
      );
    } catch (err) {
      return sendFeedbackError(err, reply);
    }
  });

  // GET /v1/operator/feedback/reports/:reportId/audit - List audit trail
  app.get('/v1/operator/feedback/reports/:reportId/audit', async (request: FastifyRequest, reply) => {
    const actor = assertOperator(request);
    const { reportId } = ReportParamsSchema.parse(request.params);

    try {
      const audit = await withOperatorContext(pool, actor.userId, (client) =>
        listTriageAudit(client, reportId)
      );

      return reply.send(
        validateResponse(FeedbackTriageAuditListResponseSchema, {
          data: audit,
          meta: meta(request.id),
        })
      );
    } catch (err) {
      return sendFeedbackError(err, reply);
    }
  });

  // POST /v1/operator/feedback/retention/purge - Purge expired terminal reports
  app.post('/v1/operator/feedback/retention/purge', async (request: FastifyRequest, reply) => {
    const actor = assertOperator(request);
    const body = FeedbackRetentionPurgeRequestSchema.parse(request.body || {});

    try {
      const result = await withOperatorContext(pool, actor.userId, (client) =>
        purgeExpiredReports(client, body.retentionDays)
      );

      return reply.send(
        validateResponse(FeedbackRetentionPurgeResponseSchema, {
          data: result,
          meta: meta(request.id),
        })
      );
    } catch (err) {
      return sendFeedbackError(err, reply);
    }
  });
}
