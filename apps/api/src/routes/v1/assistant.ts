import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import {
  AiAskRequestSchema,
  AiAskResponseSchema,
  AiAssistantHistoryResponseSchema,
  AiProposalResponseSchema,
  ConfirmAiProposalRequestSchema,
  CreateAiProposalRequestSchema,
  SaveAiDraftRequestSchema,
} from '@daynori/contracts';
import { withTenantContext, withUserContext } from '../../db/index.js';
import { NotFoundError, ValidationError, validateResponse } from '../../plugins/errorHandler.js';
import { AiServiceError } from '../../modules/ai/service.js';
import {
  askAssistant,
  cancelAiProposal,
  confirmAiProposal,
  createAiProposal,
  listAssistantHistory,
  saveAssistantDraft,
} from '../../modules/ai/assistantService.js';

function meta(requestId: string) {
  return { requestId, serverTime: new Date().toISOString() };
}

function sendAiError(
  err: unknown,
  reply: { status: (n: number) => { send: (b: unknown) => unknown } }
) {
  if (err instanceof AiServiceError) {
    return reply.status(err.statusCode).send({
      error: { message: err.message, code: err.code },
    });
  }
  if (err instanceof NotFoundError || err instanceof ValidationError) {
    throw err;
  }
  throw err;
}

export function registerAssistantRoutes(app: FastifyInstance, pool: Pool): void {
  app.post('/v1/ai/assistant/ask', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const body = AiAskRequestSchema.parse(request.body);
    const ac = new AbortController();
    request.raw.on('close', () => {
      if (!request.raw.complete) ac.abort();
    });
    try {
      const data = await askAssistant(pool, {
        userId: actor.userId,
        workspaceId: body.workspaceId,
        question: body.question,
        limit: body.limit,
        allowSuggestProposal: body.allowSuggestProposal,
        signal: ac.signal,
      });
      return reply.send(
        validateResponse(AiAskResponseSchema, { data, meta: meta(request.id) })
      );
    } catch (err) {
      return sendAiError(err, reply);
    }
  });

  app.get('/v1/ai/assistant/history', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const workspaceId = (request.query as { workspaceId?: string }).workspaceId;
    if (!workspaceId) {
      return reply.status(400).send({ error: { message: 'workspaceId required' } });
    }
    try {
      const data = await withUserContext(pool, actor.userId, (client) =>
        listAssistantHistory(client, actor.userId, workspaceId)
      );
      return reply.send(
        validateResponse(AiAssistantHistoryResponseSchema, { data, meta: meta(request.id) })
      );
    } catch (err) {
      return sendAiError(err, reply);
    }
  });

  app.post('/v1/ai/assistant/draft', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const body = SaveAiDraftRequestSchema.parse(request.body);
    try {
      await withUserContext(pool, actor.userId, (client) =>
        saveAssistantDraft(client, {
          userId: actor.userId,
          workspaceId: body.workspaceId,
          draftQuestion: body.draftQuestion,
        })
      );
      return reply.status(204).send();
    } catch (err) {
      return sendAiError(err, reply);
    }
  });

  app.post('/v1/ai/proposals', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const body = CreateAiProposalRequestSchema.parse(request.body);
    try {
      const data = await withUserContext(pool, actor.userId, (client) =>
        createAiProposal(client, {
          userId: actor.userId,
          workspaceId: body.workspaceId,
          operation: body.operation,
          payload: body.payload,
          targetItemId: body.targetItemId,
          expectedRevision: body.expectedRevision,
        })
      );
      return reply.status(201).send(
        validateResponse(AiProposalResponseSchema, { data, meta: meta(request.id) })
      );
    } catch (err) {
      return sendAiError(err, reply);
    }
  });

  app.post('/v1/ai/proposals/:proposalId/confirm', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const proposalId = (request.params as { proposalId: string }).proposalId;
    const body = ConfirmAiProposalRequestSchema.parse(request.body);
    try {
      // Resolve workspace under user context, then confirm under tenant context for item RLS.
      const workspaceId = await withUserContext(pool, actor.userId, async (client) => {
        const res = await client.query<{ workspace_id: string }>(
          `SELECT workspace_id FROM app.ai_proposals WHERE id = $1 AND user_id = $2`,
          [proposalId, actor.userId]
        );
        if (!res.rows[0]) {
          throw new AiServiceError('Proposal not found', 404, 'AI_PROPOSAL_NOT_FOUND');
        }
        return res.rows[0].workspace_id;
      });
      const data = await withTenantContext(
        pool,
        { userId: actor.userId, workspaceId },
        (client) =>
          confirmAiProposal(client, {
            userId: actor.userId,
            proposalId,
            confirmationToken: body.confirmationToken,
          })
      );
      return reply.send(
        validateResponse(AiProposalResponseSchema, { data, meta: meta(request.id) })
      );
    } catch (err) {
      return sendAiError(err, reply);
    }
  });

  app.post('/v1/ai/proposals/:proposalId/cancel', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const proposalId = (request.params as { proposalId: string }).proposalId;
    try {
      const data = await withUserContext(pool, actor.userId, (client) =>
        cancelAiProposal(client, { userId: actor.userId, proposalId })
      );
      return reply.send(
        validateResponse(AiProposalResponseSchema, { data, meta: meta(request.id) })
      );
    } catch (err) {
      return sendAiError(err, reply);
    }
  });
}
