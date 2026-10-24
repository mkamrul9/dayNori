import React from 'react';
import { expect, it, vi } from 'vitest';
import { AccountSheet, type AccountSheetProps } from './AccountSheet.js';
import { TestRenderer, act } from '../test-render.js';

it('signs in through the real adapter contract and provisions a workspace before closing', async () => {
  const adapter = {
    signInWithPassword: vi.fn().mockResolvedValue({ success: true }),
    signUp: vi.fn(),
    recoverPassword: vi.fn(),
    provisionPersonalWorkspace: vi.fn().mockResolvedValue('workspace-example'),
  } satisfies AccountSheetProps['adapter'];
  const close = vi.fn();
  const renderer = TestRenderer.create(
    React.createElement(AccountSheet, { themeMode: 'light', onClose: close, adapter })
  );
  act(() => {
    renderer.root.findByProps({ testID: 'account-email' }).props.onChangeText('owner@example.test');
  });
  act(() => {
    renderer.root
      .findByProps({ testID: 'account-password' })
      .props.onChangeText('synthetic-password');
  });
  act(() => {
    renderer.root.findByProps({ testID: 'account-submit' }).props.onPress();
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(adapter.signInWithPassword).toHaveBeenCalledWith({
    email: 'owner@example.test',
    password: 'synthetic-password',
  });
  expect(adapter.provisionPersonalWorkspace).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
  renderer.unmount();
});
