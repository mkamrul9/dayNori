import { describe, expect, it } from 'vitest';
import { colors, spacing, radii } from './index.js';

describe('Design Tokens', () => {
  it('defines light theme color values correctly', () => {
    expect(colors.light.background).toBe('#F7F5EF');
    expect(colors.light.action.primary).toBe('#146B63');
    expect(colors.light.text.primary).toBe('#172C2C');
  });

  it('defines dark theme color values correctly', () => {
    expect(colors.dark.background).toBe('#0D1919');
    expect(colors.dark.action.primary).toBe('#73C2B6');
  });

  it('provides standard layout spacing and radii scales', () => {
    expect(spacing.base).toBe(16);
    expect(radii.card).toBe(12);
  });
});
