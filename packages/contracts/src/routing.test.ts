import { describe, it, expect } from 'vitest';
import { parseDeepLinkUrl, SafeIdentifierSchema } from './routing.js';

describe('Routing contracts and URL parser', () => {
  it('validates safe identifiers and rejects malicious or path traversal strings', () => {
    expect(SafeIdentifierSchema.safeParse('valid-task_123').success).toBe(true);
    expect(SafeIdentifierSchema.safeParse('uuid-1234-abcd-5678').success).toBe(true);

    // Malicious or invalid cases
    expect(SafeIdentifierSchema.safeParse('../../../etc/passwd').success).toBe(false);
    expect(SafeIdentifierSchema.safeParse('task; DROP TABLE users;').success).toBe(false);
    expect(SafeIdentifierSchema.safeParse('<script>alert(1)</script>').success).toBe(false);
    expect(SafeIdentifierSchema.safeParse('').success).toBe(false);
    expect(SafeIdentifierSchema.safeParse('a'.repeat(65)).success).toBe(false);
  });

  it('parses valid notification deep links', () => {
    const res = parseDeepLinkUrl('daynori://notification?destination=today&itemId=task-123');
    expect(res.success).toBe(true);
    expect(res.payload).toEqual({
      type: 'notification',
      destination: 'today',
      itemId: 'task-123',
    });
  });

  it('parses notification links with plan/calendar destination', () => {
    const res = parseDeepLinkUrl('daynori://notification?destination=plan/calendar');
    expect(res.success).toBe(true);
    expect(res.payload?.destination).toBe('plan/calendar');
  });

  it('parses file deep links with safe fileId', () => {
    const res = parseDeepLinkUrl('daynori://file?fileId=pdf-456&mimeType=application/pdf');
    expect(res.success).toBe(true);
    expect(res.payload).toEqual({
      type: 'file',
      destination: 'library',
      fileId: 'pdf-456',
      mimeType: 'application/pdf',
    });
  });

  it('rejects file deep links with invalid fileId (path traversal)', () => {
    const res = parseDeepLinkUrl('daynori://file?fileId=../../secret.txt');
    expect(res.success).toBe(false);
    expect(res.error).toContain('Invalid file payload');
  });

  it('parses auth callback deep links', () => {
    const res = parseDeepLinkUrl('daynori://auth?token=synthetic-auth-token-123');
    expect(res.success).toBe(true);
    expect(res.payload).toEqual({
      type: 'auth',
      destination: 'auth-callback',
      token: 'synthetic-auth-token-123',
    });
  });

  it('parses direct custom scheme destinations', () => {
    const res1 = parseDeepLinkUrl('daynori://today');
    expect(res1.success).toBe(true);
    expect(res1.payload?.destination).toBe('today');

    const res2 = parseDeepLinkUrl('daynori://journal');
    expect(res2.success).toBe(true);
    expect(res2.payload?.destination).toBe('journal');
  });

  it('rejects unsupported or unapproved destinations without crashing', () => {
    const res = parseDeepLinkUrl('daynori://notification?destination=unapproved_admin_dashboard');
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
  });

  it('rejects completely malformed URLs', () => {
    expect(parseDeepLinkUrl('').success).toBe(false);
    expect(parseDeepLinkUrl(':::not-a-url:::').success).toBe(false);
  });
});
