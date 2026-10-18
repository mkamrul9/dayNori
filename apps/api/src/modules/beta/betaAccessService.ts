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
   * Claims an invitation code for an authenticated user with concurrency protection and seat limits.
   */
  async claimInvitation(
    userId: string,
    invitationCode: string,
    maxSeats: number = 50
  ): Promise<ClaimInvitationResult> {
    if (!invitationCode || typeof invitationCode !== 'string' || invitationCode.trim().length === 0) {
      throw new ValidationError('A valid invitation code is required');
    }

    const trimmedCode = invitationCode.trim();
    const codeHash = crypto.createHash('sha256').update(trimmedCode).digest('hex');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Check if user is already enrolled
      const alreadyEnrolled = await client.query<{ status: string }>(
        `SELECT status FROM app.beta_enrollments WHERE user_id = $1;`,
        [userId]
      );
      if (alreadyEnrolled.rows[0]?.status === 'enrolled') {
        await client.query('COMMIT');
        return {
          success: true,
          enrolled: true,
          message: 'User is already enrolled in the private beta',
        };
      }

      // 2. Atomically lock and inspect the invitation record
      const inviteRes = await client.query<{
        id: string;
        status: string;
        expires_at: Date;
      }>(
        `SELECT id, status, expires_at FROM app.beta_invitations
         WHERE invitation_code_hash = $1
         FOR UPDATE;`,
        [codeHash]
      );

      if (inviteRes.rows.length === 0) {
        throw new ExplicitForbiddenError('Invalid invitation code');
      }

      const invite = inviteRes.rows[0]!;

      if (invite.status === 'revoked') {
        throw new ExplicitForbiddenError('This beta invitation code has been revoked');
      }

      if (invite.status === 'claimed') {
        throw new ValidationError('This beta invitation code has already been claimed');
      }

      if (invite.status === 'expired' || new Date(invite.expires_at).getTime() < Date.now()) {
        await client.query(
          `UPDATE app.beta_invitations SET status = 'expired' WHERE id = $1;`,
          [invite.id]
        );
        throw new ValidationError('This beta invitation code has expired');
      }

      // 3. Enforce seat limit barrier
      const seatCountRes = await client.query<{ count: string }>(
        `SELECT count(*) as count FROM app.beta_enrollments WHERE status = 'enrolled';`
      );
      const currentEnrolledSeats = parseInt(seatCountRes.rows[0]?.count || '0', 10);
      if (currentEnrolledSeats >= maxSeats) {
        throw new ValidationError(
          `Beta participant seat limit (${maxSeats}) reached; no additional enrollments permitted`
        );
      }

      // 4. Mark invitation claimed
      await client.query(
        `UPDATE app.beta_invitations
         SET status = 'claimed',
             claimed_by_user_id = $1,
             claimed_at = now()
         WHERE id = $2;`,
        [userId, invite.id]
      );

      // 5. Enroll user
      await client.query(
        `INSERT INTO app.beta_enrollments (user_id, invitation_id, enrolled_at, status)
         VALUES ($1, $2, now(), 'enrolled')
         ON CONFLICT (user_id) DO UPDATE
           SET invitation_id = EXCLUDED.invitation_id,
               enrolled_at = now(),
               status = 'enrolled';`,
        [userId, invite.id]
      );

      await client.query('COMMIT');

      return {
        success: true,
        enrolled: true,
        message: 'Successfully enrolled in Daynori Private Beta',
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
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
