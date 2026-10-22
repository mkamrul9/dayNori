import { afterEach, expect, it, vi } from 'vitest';
import { isAllowedOrigin } from './session.js';

afterEach(() => vi.unstubAllEnvs());
it('admits the exact configured HTTPS deployment origin while rejecting lookalikes', () => {
  vi.stubEnv('DAYNORI_WEB_ORIGIN', 'https://daynori-preview.example');
  expect(isAllowedOrigin('https://daynori-preview.example')).toBe(true);
  expect(isAllowedOrigin('https://daynori-preview.example.attacker.example')).toBe(false);
  expect(isAllowedOrigin('http://daynori-preview.example')).toBe(false);
  expect(isAllowedOrigin('https://attacker.example')).toBe(false);
});
it.each([
  'https://user:pass@preview.example',
  'https://preview.example/path',
  'https://preview.example/?token=example',
  'http://preview.example',
])('does not authorize malformed deployment setting %s', (value) => {
  vi.stubEnv('DAYNORI_WEB_ORIGIN', value);
  expect(isAllowedOrigin('https://preview.example')).toBe(false);
});
