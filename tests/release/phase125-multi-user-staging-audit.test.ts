import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { assertHttpsStagingUrl, assert, RobustCdpClient } from '../../scripts/run-phase125-multi-user-staging-audit.mjs';

const RESULTS_PATH = path.resolve(__dirname, '../../artifacts/phase125/staging-verification-results.json');
const SCREENSHOTS_DIR = path.resolve(__dirname, '../../artifacts/phase125/screenshots');

describe('Phase 125 — Multi-User Authenticated Staging Verification & Tenant Isolation Suite', () => {
  it('enforces fail-closed assertions against non-HTTPS and localhost destinations', () => {
    expect(() => assertHttpsStagingUrl('http://insecure.daynori.com', 'Staging Web')).toThrow(
      /must strictly use HTTPS/
    );
    expect(() => assertHttpsStagingUrl('https://localhost:3000', 'Staging Web')).toThrow(
      /strictly prohibited from targeting localhost/
    );
    expect(() => assertHttpsStagingUrl('https://127.0.0.1:3001', 'Staging API')).toThrow(
      /strictly prohibited from targeting localhost/
    );
    expect(() => assertHttpsStagingUrl('https://0.0.0.0', 'Staging DB')).toThrow(
      /strictly prohibited from targeting localhost/
    );
    expect(() => assert(false, 'Expected failure')).toThrow(/ASSERTION_FAILED: Expected failure/);
  });

  it('verifies that RobustCdpClient send properly rejects on timeout or error', async () => {
    let messageListener: ((event: unknown) => void) | null = null;
    const fakeWs = {
      addEventListener: (_ev: string, cb: (event: unknown) => void) => {
        messageListener = cb;
      },
      send: (data: string) => {
        const parsed = JSON.parse(data);
        setTimeout(() => {
          if (messageListener) {
            messageListener({
              data: JSON.stringify({
                id: parsed.id,
                error: { message: 'Simulated CDP error response' },
              }),
            });
          }
        }, 10);
      },
    };

    const client = new RobustCdpClient(fakeWs as unknown as WebSocket);
    await expect(client.send('Target.simulateFail')).rejects.toThrow('Simulated CDP error response');
  });

  it('validates the Phase 125 staging verification results artifact', () => {
    expect(fs.existsSync(RESULTS_PATH)).toBe(true);
    const content = fs.readFileSync(RESULTS_PATH, 'utf8');
    const results = JSON.parse(content);

    expect(results.phase).toBe('125');
    expect(results.targetUrls.web).toBe('https://daynori-web-preview.onrender.com');
    expect(results.targetUrls.api).toBe('https://daynori-api-preview.onrender.com');
    expect(results.targetUrls.supabase).toBe('https://sexxceqqknqzvxuuqnkx.supabase.co');

    // Metadata checks
    expect(results.deployedMeta.webStatus).toBe(200);
    expect(results.deployedMeta.server).toBe('cloudflare');
    expect(results.deployedMeta.poweredBy).toBe('Next.js');
    expect(results.deployedMeta.deployedGitSha).toBe('1219998');

    // Summary checks
    expect(results.summary.total).toBe(10);
    expect(results.summary.passed).toBe(10);
    expect(results.summary.failed).toBe(0);
    expect(results.workflows.length).toBe(10);

    for (const wf of results.workflows) {
      expect(wf.passed).toBe(true);
      expect(wf.uiVerified).toBe(true);
      expect(wf.apiVerified).toBe(true);
      expect(wf.screenshot).not.toBeNull();
      expect(wf.screenshot.byteSize).toBeGreaterThan(10000);
      expect(fs.existsSync(wf.screenshot.path)).toBe(true);

      const buffer = fs.readFileSync(wf.screenshot.path);
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      expect(sha256).toBe(wf.screenshot.sha256);
    }
  });

  it('asserts tenant isolation invariants between User A and User B', () => {
    const results = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
    const wf9 = results.workflows.find((w: { id: string }) => w.id === 'workflow-09-tenant-isolation-proof');
    expect(wf9).toBeDefined();
    expect(wf9.passed).toBe(true);
    expect(wf9.details.userAGetUserBWorkspaceStatus).toBe(404);
    expect(wf9.details.userAGetUserBNotesStatus).toBe(404);
    expect(wf9.details.userAPostUserBTasksStatus).toBe(404);
    expect(wf9.details.userBGetUserANoteStatus).toBe(404);
    expect(wf9.details.userBDeleteUserANoteStatus).toBe(404);
    expect(wf9.details.userBDomCrossTenantLeakage).toBe(false);
    expect(wf9.details.isolationProven).toBe(true);
  });

  it('asserts optimistic revision conflict detection and reconciliation', () => {
    const results = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
    const wf7 = results.workflows.find(
      (w: { id: string }) => w.id === 'workflow-07-offline-draft-and-conflict'
    );
    expect(wf7).toBeDefined();
    expect(wf7.passed).toBe(true);
    expect(wf7.details.conflictStatusCode).toBe(409);
    expect(wf7.details.conflictErrorCode).toBe('REVISION_CONFLICT');
    expect(wf7.details.reconciledRevision).toBe(2);
    expect(wf7.details.offlineEmulationVerified).toBe(true);
    expect(wf7.details.onlineReconnectionVerified).toBe(true);
  });

  it('asserts account deletion lifecycle with pending status and cancellation', () => {
    const results = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
    const wf10 = results.workflows.find(
      (w: { id: string }) => w.id === 'workflow-10-account-deletion'
    );
    expect(wf10).toBeDefined();
    expect(wf10.passed).toBe(true);
    expect(wf10.details.deletionRequestedStatus).toBe('pending_confirmation');
    expect(wf10.details.statusPolled).toBe('pending_confirmation');
    expect(wf10.details.cancelStatusCode).toBe(200);
    expect(wf10.details.retainedDataDisclosure).toContain('Confirmation removes your organizer records');
  });

  it('verifies existence and integrity of all 10 captured screenshots', () => {
    const expectedScreenshots = [
      '01-auth-lifecycle-hydrated.png',
      '02-note-persisted-and-reloaded.png',
      '03-task-deadline-completed.png',
      '04-routine-occurrence-logged.png',
      '05-journal-entry-persisted.png',
      '06-search-query-results.png',
      '07-offline-draft-and-reconnect.png',
      '08-support-feedback-submission.png',
      '09-tenant-isolation-userB.png',
      '10-account-deletion-lifecycle.png',
    ];

    for (const shot of expectedScreenshots) {
      const shotPath = path.join(SCREENSHOTS_DIR, shot);
      expect(fs.existsSync(shotPath)).toBe(true);
      const stat = fs.statSync(shotPath);
      expect(stat.size).toBeGreaterThan(15000);
    }
  });
});
