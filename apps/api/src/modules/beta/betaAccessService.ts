import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { ExplicitForbiddenError, ValidationError } from '../../plugins/errorHandler.js';

export interface ClaimInvitationResult {
  success: boolean;
  enrolled: boolean;
  message: string;
}

export class BetaAccessService {
  constructor(private pool: Pool) {}

  /**
   * Checks whether the given user is enrolled in the private beta.
   */
  async isUserEnrolled(userId: string): Promise<boolean> {
    const res = await this.pool.query<{ count: string }>(
      `SELECT count(*) as count FROM app.beta_enrollments
       WHERE user_id = $1 AND status = 'enrolled';`,
      [userId]
    );
    return parseInt(res.rows[0]?.count || '0', 10) > 0;
  }

  /**
   * Claims an invitation code for an authenticated user with concurrency protection,
   * seat allocation serialization across invitations, recipient binding, and privilege restriction.
   */
  async claimInvitation(
    userId: string,
    invitationCode: string,
    maxSeats: number = 50,
    userEmail?: string
  ): Promise<ClaimInvitationResult> {
    if (!invitationCode || typeof invitationCode !== 'string' || invitationCode.trim().length === 0) {
      throw new ValidationError('A valid invitation code is required');
    }

    const trimmedCode = invitationCode.trim();
    const codeHash = crypto.createHash('sha256').update(trimmedCode).digest('hex');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query<{ res: ClaimInvitationResult }>(
        `SELECT app.claim_beta_invitation($1, $2, $3, $4) as res;`,
        [codeHash, userId, userEmail || null, maxSeats]
      );

      await client.query('COMMIT');
      return res.rows[0]!.res;
    } catch (err: unknown) {
      await client.query('ROLLBACK').catch(() => {});
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('FORBIDDEN') ||
        msg.includes('Invalid invitation code') ||
        msg.includes('revoked') ||
        msg.includes('bound to a specific recipient')
      ) {
        throw new ExplicitForbiddenError(
          msg.replace(/^.*?FORBIDDEN:\s*/i, '').replace(/^.*?error:\s*/i, '')
        );
      }
      if (
        msg.includes('VALIDATION_FAILED') ||
        msg.includes('already been claimed') ||
        msg.includes('expired') ||
        msg.includes('seat limit')
      ) {
        throw new ValidationError(
          msg.replace(/^.*?VALIDATION_FAILED:\s*/i, '').replace(/^.*?error:\s*/i, '')
        );
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Helper to seed/create an invitation code (used in tests and administrative provisioning).
   */
  async createInvitation(
    clientOrPool: Pool | PoolClient,
    code: string,
    options?: { recipientEmail?: string; expiresInHours?: number }
  ): Promise<{ id: string; codeHash: string }> {
    const codeHash = crypto.createHash('sha256').update(code.trim()).digest('hex');
    const hours = options?.expiresInHours || 72;
    const res = await clientOrPool.query<{ id: string }>(
      `INSERT INTO app.beta_invitations (invitation_code_hash, recipient_email, status, expires_at)
       VALUES ($1, $2, 'active', now() + ($3 || ' hours')::interval)
       RETURNING id;`,
      [codeHash, options?.recipientEmail || null, String(hours)]
    );
    return { id: res.rows[0]!.id, codeHash };
  }
}
