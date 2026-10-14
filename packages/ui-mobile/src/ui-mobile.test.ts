import { describe, expect, it } from 'vitest';
import React from 'react';
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
    expect(lightMobileTheme.touchTargets.mobileMin).toBe(48);
    // Semantic danger action tokens for mobile buttons (F03 fix)
    expect(lightMobileTheme.colors.action.danger).toBe('#B3261E');
    expect(lightMobileTheme.colors.action.dangerLabel).toBe('#FFFFFF');
    expect(darkMobileTheme.colors.action.danger).toBe('#F2B8B5');
    expect(darkMobileTheme.colors.action.dangerLabel).toBe('#381615');
  });

  it('exports all mobile primitive components', () => {
    expect(MobileButton).toBeDefined();
    expect(MobileTextField).toBeDefined();
    expect(MobileModalSheet).toBeDefined();
    expect(MobileFeedback).toBeDefined();
    expect(MobileListRow).toBeDefined();
    expect(MobileCard).toBeDefined();
  });

  it('creates MobileButton and MobileModalSheet React elements with expected props', () => {
    const btn = React.createElement(MobileButton, {
      variant: 'danger',
      themeMode: 'dark',
      title: 'Delete Item',
    });
    expect(btn.type).toBe(MobileButton);
    expect(btn.props.variant).toBe('danger');
    expect(btn.props.themeMode).toBe('dark');

    const sheet = React.createElement(MobileModalSheet, {
      visible: true,
      onClose: () => {},
      title: 'Modal Sheet',
      themeMode: 'light',
      children: null,
    });
    expect(sheet.type).toBe(MobileModalSheet);
    expect(sheet.props.title).toBe('Modal Sheet');
    expect(sheet.props.visible).toBe(true);
  });
});
