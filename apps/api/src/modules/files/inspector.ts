import crypto from 'node:crypto';
import {
  ALLOWED_MIME_TYPES,
  MAX_GENERAL_FILE_BYTES,
  MAX_AUDIO_FILE_BYTES,
} from '@daynori/contracts';

export interface InspectedContent {
  detectedMimeType: string;
  sha256Checksum: string;
  byteSize: number;
  isValid: boolean;
  isActiveContent: boolean;
  rejectionReason?: string;
}

/**
 * Sniffs the actual MIME type from raw binary bytes using magic numbers.
 */
export function detectMimeType(bytes: Buffer): string {
  if (bytes.length === 0) {
    return 'application/octet-stream';
  }

  // 1. JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // 3. GIF: GIF87a or GIF89a
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return 'image/gif';
  }

  // 4. WebP: RIFF .... WEBP
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  // 5. PDF: %PDF-
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }

  // 6. Ogg: OggS
  if (bytes.length >= 4 && bytes.subarray(0, 4).toString('ascii') === 'OggS') {
    return 'audio/ogg';
  }

  // 7. WAV: RIFF .... WAVE
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WAVE'
  ) {
    return 'audio/wav';
  }

  // 8. MP3: ID3 or frame sync FF FB / FF F3
  if (bytes.length >= 3 && bytes.subarray(0, 3).toString('ascii') === 'ID3') {
    return 'audio/mpeg';
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) {
    return 'audio/mpeg';
  }

  // 9. MP4: ftyp at offset 4
  if (bytes.length >= 8 && bytes.subarray(4, 8).toString('ascii') === 'ftyp') {
    return 'audio/mp4';
  }

  // 10. WebM: 1A 45 DF A3
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return 'audio/webm';
  }

  // 11. Office Zip (docx / xlsx): PK\x03\x04
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    // Check internal structures for word or xl
    const preview = bytes.subarray(0, Math.min(bytes.length, 2048)).toString('utf-8');
    if (preview.includes('word/')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    if (preview.includes('xl/')) {
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    return 'application/zip';
  }

  // 12. Office Compound Document (.doc): D0 CF 11 E0 A1 B1 1A E1
  if (
    bytes.length >= 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 &&
    bytes[5] === 0xb1 &&
    bytes[6] === 0x1a &&
    bytes[7] === 0xe1
  ) {
    return 'application/msword';
  }

  // 13. Check for UTF-8 Text / Markdown
  if (isUtf8Text(bytes)) {
    return 'text/plain';
  }

  return 'application/octet-stream';
}

function isUtf8Text(bytes: Buffer): boolean {
  // Check up to first 4096 bytes for control characters
  const checkLen = Math.min(bytes.length, 4096);
  for (let i = 0; i < checkLen; i++) {
    const byte = bytes[i]!;
    // Allow CR, LF, Tab
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d) continue;
    // Reject NUL and other control chars below 0x20
    if (byte < 0x20) return false;
  }
  try {
    const text = bytes.subarray(0, checkLen).toString('utf-8');
    return !text.includes('\ufffd');
  } catch {
    return false;
  }
}

/**
 * Inspects binary for dangerous active content (SVG scripts, HTML tags, PE/ELF executables).
 */
export function checkActiveContent(bytes: Buffer): { isActiveContent: boolean; reason?: string } {
  const checkLen = Math.min(bytes.length, 8192);
  const sample = bytes.subarray(0, checkLen);
  const sampleAscii = sample.toString('ascii').toLowerCase();

  // Executable signatures
  if (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) {
    return { isActiveContent: true, reason: 'Windows executable binary (MZ) rejected' };
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x7f &&
    bytes[1] === 0x45 &&
    bytes[2] === 0x4c &&
    bytes[3] === 0x46
  ) {
    return { isActiveContent: true, reason: 'Linux ELF executable rejected' };
  }
  if (sampleAscii.startsWith('#!')) {
    return { isActiveContent: true, reason: 'Shell script header rejected' };
  }

  // SVG Active Content
  if (
    sampleAscii.includes('<svg') ||
    sampleAscii.includes('xmlns="http://www.w3.org/2000/svg"') ||
    sampleAscii.includes("xmlns='http://www.w3.org/2000/svg'")
  ) {
    return {
      isActiveContent: true,
      reason: 'SVG image contains executable active script vectors and is disallowed',
    };
  }

  // HTML / Script injection
  if (
    sampleAscii.includes('<!doctype html') ||
    sampleAscii.includes('<html') ||
    sampleAscii.includes('<script') ||
    sampleAscii.includes('javascript:') ||
    sampleAscii.includes('onload=') ||
    sampleAscii.includes('onerror=')
  ) {
    return {
      isActiveContent: true,
      reason: 'HTML markup or embedded script vectors rejected',
    };
  }

  return { isActiveContent: false };
}

/**
 * Full content inspection and verification of stored bytes.
 */
export function inspectBinaryContent(
  bytes: Buffer,
  declaredMimeType: string,
  maxAllowedBytes: number
): InspectedContent {
  const sha256Checksum = crypto.createHash('sha256').update(bytes).digest('hex');
  const actualSize = bytes.length;

  // Enforce reservation capability byte bound
  if (actualSize > maxAllowedBytes) {
    return {
      detectedMimeType: 'application/octet-stream',
      sha256Checksum,
      byteSize: actualSize,
      isValid: false,
      isActiveContent: false,
      rejectionReason: `File size ${actualSize} bytes exceeds reservation limit of ${maxAllowedBytes} bytes`,
    };
  }

  // Active content check
  const activeCheck = checkActiveContent(bytes);
  if (activeCheck.isActiveContent) {
    return {
      detectedMimeType: 'application/octet-stream',
      sha256Checksum,
      byteSize: actualSize,
      isValid: false,
      isActiveContent: true,
      rejectionReason: activeCheck.reason,
    };
  }

  // Detect true MIME
  let detectedMime = detectMimeType(bytes);

  // Treat markdown as text/markdown if declared as markdown and detected as text/plain
  if (
    detectedMime === 'text/plain' &&
    (declaredMimeType === 'text/markdown' || declaredMimeType === 'text/plain')
  ) {
    detectedMime = declaredMimeType;
  }

  // Verify against allowed mime types
  const isAllowedMime = (ALLOWED_MIME_TYPES as readonly string[]).includes(detectedMime);
  if (!isAllowedMime) {
    return {
      detectedMimeType: detectedMime,
      sha256Checksum,
      byteSize: actualSize,
      isValid: false,
      isActiveContent: false,
      rejectionReason: `File type '${detectedMime}' is not permitted by upload policy`,
    };
  }

  // Verify size bounds
  const isAudio = detectedMime.startsWith('audio/');
  const maxLimit = isAudio ? MAX_AUDIO_FILE_BYTES : MAX_GENERAL_FILE_BYTES;
  if (actualSize > maxLimit) {
    return {
      detectedMimeType: detectedMime,
      sha256Checksum,
      byteSize: actualSize,
      isValid: false,
      isActiveContent: false,
      rejectionReason: `File size ${actualSize} exceeds allowed limit of ${maxLimit} bytes`,
    };
  }

  // Check declared vs detected MIME family compatibility
  const declaredFamily = declaredMimeType.split('/')[0];
  const detectedFamily = detectedMime.split('/')[0];
  if (declaredFamily && detectedFamily && declaredFamily !== detectedFamily) {
    return {
      detectedMimeType: detectedMime,
      sha256Checksum,
      byteSize: actualSize,
      isValid: false,
      isActiveContent: false,
      rejectionReason: `Declared MIME type '${declaredMimeType}' does not match detected file signature '${detectedMime}'`,
    };
  }

  return {
    detectedMimeType: detectedMime,
    sha256Checksum,
    byteSize: actualSize,
    isValid: true,
    isActiveContent: false,
  };
}
