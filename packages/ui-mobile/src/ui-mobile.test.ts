import { describe, expect, it } from 'vitest';
import {
  lightMobileTheme,
  darkMobileTheme,
  MobileButton,
  MobileCard,
  MobileFeedback,
  MobileListRow,
  MobileModalSheet,
  MobileTextField,
} from './index.js';

describe('UI Mobile Primitives', () => {
  it('provides light and dark mobile themes with correct token values', () => {
    expect(lightMobileTheme.colors.background).toBe('#F7F5EF');
    expect(darkMobileTheme.colors.background).toBe('#0D1919');
    expect(lightMobileTheme.spacing.base).toBe(16);
  });

  it('exports all mobile primitive components', () => {
    expect(MobileButton).toBeDefined();
    expect(MobileTextField).toBeDefined();
    expect(MobileModalSheet).toBeDefined();
    expect(MobileFeedback).toBeDefined();
    expect(MobileListRow).toBeDefined();
    expect(MobileCard).toBeDefined();
  });
});
