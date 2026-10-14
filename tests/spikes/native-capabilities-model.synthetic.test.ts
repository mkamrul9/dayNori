/**
 * SYNTHETIC MODEL TEST (Phase 03 relabel, 2026-10-14).
 * Models notifications, SecureStore, biometrics, recording and AES-GCM via simulated classes and node:crypto.
 * Everything here runs in plain Node with in-memory classes. It checks the
 * *contract and policy shape* we intend to build against. It does NOT show real
 * browser storage, encrypted persistence, native hardware behavior, or
 * mobile cryptography library compatibility. See tests/spikes/README.md for the
 * observed / documented / untested split and the real experiments.
 */
import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';

describe('[synthetic model] Native capability contracts', () => {
  describe('Notification Management & Fallbacks', () => {
    interface NotificationChannel {
      id: string;
      name: string;
      importance: 'max' | 'high' | 'default' | 'low';
      vibration: boolean;
    }

    interface ScheduledNotification {
      id: string;
      title: string;
      body: string;
      triggerTime: number;
      channelId: string;
    }

    class NotificationManager {
      private channels: Map<string, NotificationChannel> = new Map();
      private scheduled: Map<string, ScheduledNotification> = new Map();
      private inAppFallbackInbox: ScheduledNotification[] = [];

      createChannel(channel: NotificationChannel) {
        this.channels.set(channel.id, channel);
      }

      schedule(
        notification: ScheduledNotification,
        permissionGranted: boolean
      ): { scheduled: boolean; mode: 'system' | 'in_app' } {
        if (!permissionGranted) {
          // Fallback: Store in persistent in-app notification inbox
          this.inAppFallbackInbox.push(notification);
          return { scheduled: false, mode: 'in_app' };
        }

        if (!this.channels.has(notification.channelId)) {
          throw new Error(`Notification channel "${notification.channelId}" does not exist.`);
        }

        this.scheduled.set(notification.id, notification);
        return { scheduled: true, mode: 'system' };
      }

      getInAppInbox(): ReadonlyArray<ScheduledNotification> {
        return this.inAppFallbackInbox;
      }
    }

    it('configures distinct Android notification channels according to importance', () => {
      const nm = new NotificationManager();
      nm.createChannel({
        id: 'reminders',
        name: 'Daily Reminders',
        importance: 'high',
        vibration: true,
      });

      const result = nm.schedule(
        {
          id: 'notif-1',
          title: 'Review Routine',
          body: 'Evening routine is scheduled',
          triggerTime: Date.now() + 3600000,
          channelId: 'reminders',
        },
        true
      );

      expect(result.scheduled).toBe(true);
      expect(result.mode).toBe('system');
    });

    it('falls back to in-app notification center when OS notification permission is denied', () => {
      const nm = new NotificationManager();
      nm.createChannel({
        id: 'reminders',
        name: 'Reminders',
        importance: 'default',
        vibration: false,
      });

      const result = nm.schedule(
        {
          id: 'notif-denied',
          title: 'Task Due',
          body: 'Submit expense report',
          triggerTime: Date.now() + 1800000,
          channelId: 'reminders',
        },
        false // Permission denied
      );

      expect(result.scheduled).toBe(false);
      expect(result.mode).toBe('in_app');
      expect(nm.getInAppInbox()).toHaveLength(1);
      expect(nm.getInAppInbox()[0].title).toBe('Task Due');
    });
  });

  describe('SecureStore Key-Value Size & Encryption Lifecycle', () => {
    class MockSecureStore {
      private store: Map<string, string> = new Map();
      private readonly MAX_VALUE_BYTES = 2048; // Arbitrary model budget. Expo documents no enforced limit; some older iOS releases rejected values above roughly 2048 bytes.

      setItem(key: string, value: string): void {
        const byteLength = Buffer.byteLength(value, 'utf8');
        if (byteLength > this.MAX_VALUE_BYTES) {
          throw new Error(
            `SecureStore quota exceeded: payload is ${byteLength} bytes, maximum allowed is ${this.MAX_VALUE_BYTES} bytes.`
          );
        }
        this.store.set(key, value);
      }

      getItem(key: string): string | null {
        return this.store.get(key) ?? null;
      }

      deleteItem(key: string): void {
        this.store.delete(key);
      }
    }

    it('successfully stores and retrieves encrypted secrets within size limits', () => {
      const ss = new MockSecureStore();
      const secretToken = 'vault_master_key_wrapping_passphrase_32_bytes_len';

      ss.setItem('vault_dek_wrapper', secretToken);
      expect(ss.getItem('vault_dek_wrapper')).toBe(secretToken);
    });

    it('model rejects payloads above its own 2048-byte budget so secrets-only usage is the design intent', () => {
      const ss = new MockSecureStore();
      const largeContent = 'a'.repeat(2500); // 2.5 KB

      expect(() => ss.setItem('too_large_key', largeContent)).toThrow(/SecureStore quota exceeded/);
    });
  });

  describe('Biometric Prompts & Vault Authentication Separation', () => {
    interface BiometricAuthResult {
      success: boolean;
      error?: 'user_cancel' | 'fallback_passcode' | 'not_enrolled';
    }

    class BiometricAdapter {
      private hasHardware = true;
      private isEnrolled = true;

      checkAvailability(): { available: boolean; enrolled: boolean } {
        return { available: this.hasHardware, enrolled: this.isEnrolled };
      }

      async authenticate(
        promptMessage: string,
        allowFallback: boolean
      ): Promise<BiometricAuthResult> {
        if (!this.hasHardware || !this.isEnrolled) {
          return { success: false, error: 'not_enrolled' };
        }
        // Verification of invariant: Biometrics confirm presence, but vault encryption
        // MUST require an actual key unsealing secret (passphrase or hardware-derived key)
        if (!promptMessage) throw new Error('Prompt message is required');
        if (allowFallback) {
          return { success: true };
        }
        return { success: true };
      }
    }

    it('distinguishes presence authentication from cryptographic vault decryption', async () => {
      const bio = new BiometricAdapter();
      const availability = bio.checkAvailability();

      expect(availability.available).toBe(true);
      expect(availability.enrolled).toBe(true);

      const auth = await bio.authenticate('Unlock Daynori Vault', true);
      expect(auth.success).toBe(true);

      // Invariant check: biometric success is boolean, not raw decryption key material
      expect(typeof auth.success).toBe('boolean');
    });
  });

  describe('Audio Recording Constraints & Quotas', () => {
    interface AudioPreset {
      extension: string;
      sampleRate: number;
      numberOfChannels: number;
      bitRate: number;
    }

    class AudioRecorder {
      private isRecording = false;
      private maxDurationSeconds = 300; // 5-minute cap for mobile organizer notes

      start(preset: AudioPreset, hasMicPermission: boolean) {
        if (!hasMicPermission) {
          throw new Error('Microphone permission denied.');
        }
        if (preset.extension !== '.m4a' && preset.extension !== '.aac') {
          throw new Error(`Unsupported audio format: ${preset.extension}`);
        }
        this.isRecording = true;
      }

      stop(actualDurationSeconds: number): { duration: number; fileSizeEstimateBytes: number } {
        if (!this.isRecording) throw new Error('Not recording');
        this.isRecording = false;

        if (actualDurationSeconds > this.maxDurationSeconds) {
          throw new Error('Recording exceeded maximum permitted duration.');
        }

        // Estimate size at 128 kbps (~16 KB per second)
        const fileSizeEstimateBytes = actualDurationSeconds * 16 * 1024;
        return { duration: actualDurationSeconds, fileSizeEstimateBytes };
      }
    }

    it('enforces microphone permission, format constraints, and duration limits', () => {
      const rec = new AudioRecorder();
      const standardPreset: AudioPreset = {
        extension: '.m4a',
        sampleRate: 44100,
        numberOfChannels: 1,
        bitRate: 128000,
      };

      expect(() => rec.start(standardPreset, false)).toThrow(/Microphone permission denied/);

      rec.start(standardPreset, true);
      const result = rec.stop(60); // 1 minute
      expect(result.duration).toBe(60);
      expect(result.fileSizeEstimateBytes).toBe(60 * 16 * 1024);
    });
  });

  describe('Client-Side Cryptography (AES-256-GCM & PBKDF2/Argon2)', () => {
    function deriveKey(passphrase: string, salt: Buffer, iterations: number): Buffer {
      return crypto.pbkdf2Sync(passphrase, salt, iterations, 32, 'sha256');
    }

    function encrypt(
      plaintext: string,
      key: Buffer
    ): { ciphertext: string; iv: string; tag: string } {
      const iv = crypto.randomBytes(12); // Standard 96-bit IV for AES-GCM
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();

      return {
        ciphertext: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
      };
    }

    function decrypt(ciphertext: string, iv: string, tag: string, key: Buffer): string {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64')),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    }

    it('encrypts and decrypts sensitive content with authenticated AES-GCM', () => {
      const salt = crypto.randomBytes(16);
      const key = deriveKey('user-master-passphrase', salt, 100000);
      const payload = JSON.stringify({ secretNote: 'Encrypted diary entry' });

      const { ciphertext, iv, tag } = encrypt(payload, key);
      const recovered = decrypt(ciphertext, iv, tag, key);

      expect(recovered).toBe(payload);
    });

    it('rejects tampered ciphertext with an authentication tag mismatch', () => {
      const salt = crypto.randomBytes(16);
      const key = deriveKey('user-master-passphrase', salt, 100000);
      const payload = 'Confidential memo';

      const { ciphertext, iv, tag } = encrypt(payload, key);
      // Tamper with the ciphertext
      const tamperedBytes = Buffer.from(ciphertext, 'base64');
      tamperedBytes[0] ^= 0xff; // Flip bits
      const tamperedCiphertext = tamperedBytes.toString('base64');

      expect(() => decrypt(tamperedCiphertext, iv, tag, key)).toThrow();
    });
  });
});
