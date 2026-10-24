import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  encryptWebPushPayload,
  decryptWebPushPayload,
  assertSafePushEndpointNetworkDestination,
  isDisallowedIpv4,
  isDisallowedIpv6,
  type PushDnsLookupFn,
} from '../../apps/worker/src/crypto/webPushEncryption.js';
import {
  validateOnboardingState,
  getInitialOnboardingStepIndex,
  mergeOnboardingState,
  resetOnboardingForReplay,
  completeOnboarding,
  getDefaultOnboardingState,
  type OnboardingState,
} from '@daynori/domain';

describe('Prerequisite Defect Repairs: Web Push Transport, Onboarding Recovery, and Concurrency', () => {
  describe('1. Web Push Transport & RFC 8188 Cryptographic Interoperability', () => {
    it('accepts public DNS hostnames without rejecting them as malformed IPv4', async () => {
      // Mock DNS lookup returning public IP for fcm.googleapis.com
      const mockLookup: PushDnsLookupFn = async (hostname: string) => {
        if (hostname === 'fcm.googleapis.com') {
          return [{ address: '142.250.190.42', family: 4 }];
        }
        if (hostname === 'updates.push.services.mozilla.com') {
          return [{ address: '54.240.244.1', family: 4 }];
        }
        return [{ address: '93.184.216.34', family: 4 }];
      };

      const fcmRes = await assertSafePushEndpointNetworkDestination(
        'https://fcm.googleapis.com/fcm/send/test-device-token-123',
        { lookup: mockLookup }
      );
      expect(fcmRes.hostname).toBe('fcm.googleapis.com');
      expect(fcmRes.resolvedAddresses[0]?.address).toBe('142.250.190.42');

      const mozillaRes = await assertSafePushEndpointNetworkDestination(
        'https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB...',
        { lookup: mockLookup }
      );
      expect(mozillaRes.hostname).toBe('updates.push.services.mozilla.com');
      expect(mozillaRes.resolvedAddresses[0]?.address).toBe('54.240.244.1');
    });

    it('rejects DNS names that resolve to private, loopback, or internal IP addresses (SSRF defense)', async () => {
      const rebindingLookup: PushDnsLookupFn = async () => {
        return [{ address: '127.0.0.1', family: 4 }];
      };

      await expect(
        assertSafePushEndpointNetworkDestination('https://malicious.example.org/push', {
          lookup: rebindingLookup,
        })
      ).rejects.toThrow(/private|disallowed/);

      const privateIpv6Lookup: PushDnsLookupFn = async () => {
        return [{ address: '::1', family: 6 }];
      };

      await expect(
        assertSafePushEndpointNetworkDestination('https://evil-ipv6.example.org/push', {
          lookup: privateIpv6Lookup,
        })
      ).rejects.toThrow(/private|disallowed/);

      const mappedLookup: PushDnsLookupFn = async () => {
        return [{ address: '::ffff:192.168.1.1', family: 6 }];
      };

      await expect(
        assertSafePushEndpointNetworkDestination('https://mapped.example.org/push', {
          lookup: mappedLookup,
        })
      ).rejects.toThrow(/private|disallowed/);
    });

    it('distinguishes IP literals from hostnames directly', () => {
      expect(isDisallowedIpv4('127.0.0.1')).toBe(true);
      expect(isDisallowedIpv4('10.0.0.1')).toBe(true);
      expect(isDisallowedIpv4('192.168.0.1')).toBe(true);
      expect(isDisallowedIpv4('172.16.0.1')).toBe(true);
      expect(isDisallowedIpv4('169.254.169.254')).toBe(true);
      expect(isDisallowedIpv4('8.8.8.8')).toBe(false);

      expect(isDisallowedIpv6('::1')).toBe(true);
      expect(isDisallowedIpv6('fe80::1')).toBe(true);
      expect(isDisallowedIpv6('::ffff:127.0.0.1')).toBe(true);
      expect(isDisallowedIpv6('2001:4860:4860::8888')).toBe(false);
    });

    it('encrypts and successfully decrypts with compliant RFC 8188 receiver (zero-length AAD)', () => {
      // 1. Generate client P-256 receiver key pair
      const clientEcdh = crypto.createECDH('prime256v1');
      clientEcdh.generateKeys();
      const clientPublicKey = clientEcdh.getPublicKey('base64url');
      const clientPrivateKey = clientEcdh.getPrivateKey('base64');
      const clientAuthSecret = crypto.randomBytes(16).toString('base64');

      const originalPayload = JSON.stringify({
        title: 'Routine Reminder 🎉',
        body: 'Multiline\nTest with unicode: 每天的生活 🚀 & special chars: <>&"',
        category: 'routine',
        timestamp: '2026-10-18T10:00:00.000Z',
      });

      // Encrypt with Daynori worker implementation
      const encrypted = encryptWebPushPayload({
        p256dh: clientPublicKey,
        auth: clientAuthSecret,
        payload: originalPayload,
      });

      // Decrypt with RFC 8188 compliant receiver
      const decrypted = decryptWebPushPayload({
        clientPrivateKey,
        clientAuthSecret,
        encryptedRecord: encrypted,
      });

      expect(decrypted).toBe(originalPayload);
    });

    it('enforces payload bounds and validates malformed client keys', () => {
      const clientAuthSecret = crypto.randomBytes(16).toString('base64');

      // Invalid short public key
      expect(() => {
        encryptWebPushPayload({
          p256dh: 'shortkey',
          auth: clientAuthSecret,
          payload: 'test',
        });
      }).toThrow(/Invalid client p256dh public key/);

      // Invalid short auth secret
      const clientEcdh = crypto.createECDH('prime256v1');
      clientEcdh.generateKeys();
      const clientPublicKey = clientEcdh.getPublicKey('base64url');
      expect(() => {
        encryptWebPushPayload({
          p256dh: clientPublicKey,
          auth: Buffer.from('short').toString('base64'),
          payload: 'test',
        });
      }).toThrow(/Invalid client auth secret/);
    });
  });

  describe('2. Onboarding Persistence, Recovery, and Concurrency', () => {
    it('validates and bounds corrupted or unexpected onboarding state', () => {
      const valid = validateOnboardingState(null);
      expect(valid.step).toBe('capture');
      expect(valid.completed).toBe(false);
      expect(valid.skipped).toBe(false);
      expect(valid.selectedInterests).toEqual(['notes', 'planning', 'journal', 'files']);

      // Bounded and sanitized from dirty input
      const sanitized = validateOnboardingState({
        step: 'invalid_step',
        completed: 'yes' as unknown as boolean,
        skipped: false,
        selectedInterests: ['notes', 'fake_interest', 123 as unknown as string],
        createdSampleItemIds: Array.from({ length: 50 }, (_, i) => `item-${i}`),
        createdFolderId: 'f-1',
      });

      expect(sanitized.step).toBe('capture');
      expect(sanitized.completed).toBe(false);
      expect(sanitized.selectedInterests).toEqual(['notes']);
      expect(sanitized.createdSampleItemIds.length).toBeLessThanOrEqual(20);
      expect(sanitized.createdFolderId).toBe('f-1');
    });

    it('computes initial step index for normal resume vs replay mode', () => {
      const inProgressState: OnboardingState = {
        ...getDefaultOnboardingState(),
        step: 'planning',
      };

      // Resumes at index 1 ('planning' in TUTORIAL_STEPS: ['capture', 'planning', 'organize'])
      expect(getInitialOnboardingStepIndex(inProgressState, false)).toBe(1);

      // Replay mode always starts at step 0 ('capture')
      expect(getInitialOnboardingStepIndex(inProgressState, true)).toBe(0);

      // Completed or skipped state starts at 0
      const completedState: OnboardingState = {
        ...getDefaultOnboardingState(),
        completed: true,
      };
      expect(getInitialOnboardingStepIndex(completedState, false)).toBe(0);
    });

    it('merges concurrent onboarding edits preserving layout and completion idempotently', () => {
      const localState: OnboardingState = {
        step: 'organize',
        completed: false,
        skipped: false,
        selectedInterests: ['notes', 'planning'],
        createdSampleItemIds: ['sample-note-1'],
        createdFolderId: 'folder-1',
        completedAt: null,
      };

      const serverState: OnboardingState = {
        step: 'planning',
        completed: true,
        skipped: false,
        selectedInterests: ['journal'],
        createdSampleItemIds: ['sample-task-1'],
        createdFolderId: 'folder-1',
        completedAt: '2026-10-18T05:00:00.000Z',
      };

      const merged = mergeOnboardingState(localState, serverState);

      // Completion wins
      expect(merged.completed).toBe(true);
      expect(merged.completedAt).toBe('2026-10-18T05:00:00.000Z');
      // Local selected interests are preserved
      expect(merged.selectedInterests).toEqual(['notes', 'planning']);
      // Union of created sample IDs
      expect(merged.createdSampleItemIds).toEqual(
        expect.arrayContaining(['sample-note-1', 'sample-task-1'])
      );
      expect(merged.createdFolderId).toBe('folder-1');
    });

    it('preserves user interests and created sample references across replay cycle', () => {
      const originalState: OnboardingState = {
        step: 'review',
        completed: true,
        skipped: false,
        selectedInterests: ['notes', 'tasks'],
        createdSampleItemIds: ['s-note-uuid', 's-task-uuid'],
        createdFolderId: 's-folder-uuid',
        completedAt: '2026-10-17T12:00:00.000Z',
      };

      const replayPrep = resetOnboardingForReplay(originalState);
      expect(replayPrep.completed).toBe(false);
      expect(replayPrep.step).toBe('capture');
      // Must preserve sample item identities so replay never re-creates them
      expect(replayPrep.createdSampleItemIds).toEqual(['s-note-uuid', 's-task-uuid']);
      expect(replayPrep.createdFolderId).toBe('s-folder-uuid');

      // Finishing replay
      const finishedReplay = completeOnboarding(replayPrep);
      expect(finishedReplay.completed).toBe(true);
      expect(finishedReplay.createdSampleItemIds).toEqual(['s-note-uuid', 's-task-uuid']);
    });
  });
});
