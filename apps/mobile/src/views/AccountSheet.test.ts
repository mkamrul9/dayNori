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
    getSessionGeneration: vi.fn().mockReturnValue(1),
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

it('keeps the session and offers workspace retry when provision fails after sign-in', async () => {
  const provision = vi
    .fn()
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce('ws-retry');
  const adapter = {
    signInWithPassword: vi.fn().mockResolvedValue({ success: true }),
    signUp: vi.fn(),
    recoverPassword: vi.fn(),
    provisionPersonalWorkspace: provision,
  } satisfies AccountSheetProps['adapter'];
  const close = vi.fn();
  const renderer = TestRenderer.create(
    React.createElement(AccountSheet, { themeMode: 'dark', onClose: close, adapter })
  );
  act(() => {
    renderer.root.findByProps({ testID: 'account-email' }).props.onChangeText('owner@example.test');
  });
  act(() => {
    renderer.root.findByProps({ testID: 'account-password' }).props.onChangeText('pw');
  });
  act(() => {
    renderer.root.findByProps({ testID: 'account-submit' }).props.onPress();
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(close).not.toHaveBeenCalled();
  expect(provision).toHaveBeenCalledTimes(1);
  expect(String(renderer.root.findByProps({ testID: 'account-message' }).props.children)).toMatch(
    /Workspace setup|unavailable/i
  );

  act(() => {
    renderer.root.findByProps({ testID: 'account-submit' }).props.onPress();
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(provision).toHaveBeenCalledTimes(2);
  expect(close).toHaveBeenCalledTimes(1);
  renderer.unmount();
});

it('discards provision when session generation changes after sign-in completes', async () => {
  let gen = 1;
  const adapter = {
    signInWithPassword: vi.fn().mockImplementation(async () => {
      gen = 2; // normal sign-in bump
      return { success: true };
    }),
    signUp: vi.fn(),
    recoverPassword: vi.fn(),
    getSessionGeneration: vi.fn(() => gen),
    provisionPersonalWorkspaceDetailed: vi.fn().mockImplementation(async () => {
      gen = 3; // concurrent sign-out/switch during provision
      return { status: 'ready', workspaceId: 'ws-stale' };
    }),
  } satisfies AccountSheetProps['adapter'];
  const close = vi.fn();
  const renderer = TestRenderer.create(
    React.createElement(AccountSheet, { themeMode: 'light', onClose: close, adapter })
  );
  act(() => {
    renderer.root.findByProps({ testID: 'account-email' }).props.onChangeText('a@b.c');
  });
  act(() => {
    renderer.root.findByProps({ testID: 'account-password' }).props.onChangeText('pw');
  });
  act(() => {
    renderer.root.findByProps({ testID: 'account-submit' }).props.onPress();
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(close).not.toHaveBeenCalled();
  renderer.unmount();
});

it('closes after sign-in when generation only bumps from that sign-in', async () => {
  let gen = 5;
  const adapter = {
    signInWithPassword: vi.fn().mockImplementation(async () => {
      gen = 6;
      return { success: true };
    }),
    signUp: vi.fn(),
    recoverPassword: vi.fn(),
    getSessionGeneration: vi.fn(() => gen),
    provisionPersonalWorkspace: vi.fn().mockResolvedValue('ws-ok'),
  } satisfies AccountSheetProps['adapter'];
  const close = vi.fn();
  const renderer = TestRenderer.create(
    React.createElement(AccountSheet, { themeMode: 'light', onClose: close, adapter })
  );
  act(() => {
    renderer.root.findByProps({ testID: 'account-email' }).props.onChangeText('peer@example.test');
  });
  act(() => {
    renderer.root.findByProps({ testID: 'account-password' }).props.onChangeText('pw');
  });
  act(() => {
    renderer.root.findByProps({ testID: 'account-submit' }).props.onPress();
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(adapter.provisionPersonalWorkspace).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
  renderer.unmount();
});

it('does not call invalid credentials messaging for provider outages', async () => {
  const adapter = {
    signInWithPassword: vi.fn().mockResolvedValue({
      success: false,
      error: 'Authentication service unavailable',
      failureCode: 'unavailable',
    }),
    signUp: vi.fn(),
    recoverPassword: vi.fn(),
    getSessionGeneration: vi.fn().mockReturnValue(0),
  } satisfies AccountSheetProps['adapter'];
  const close = vi.fn();
  const renderer = TestRenderer.create(
    React.createElement(AccountSheet, { themeMode: 'light', onClose: close, adapter })
  );
  act(() => {
    renderer.root.findByProps({ testID: 'account-email' }).props.onChangeText('a@b.c');
  });
  act(() => {
    renderer.root.findByProps({ testID: 'account-password' }).props.onChangeText('x');
  });
  act(() => {
    renderer.root.findByProps({ testID: 'account-submit' }).props.onPress();
  });
  await act(async () => {
    await Promise.resolve();
  });
  const msg = String(renderer.root.findByProps({ testID: 'account-message' }).props.children);
  expect(msg).toMatch(/unavailable/i);
  expect(msg).not.toMatch(/Invalid email or password/i);
  expect(close).not.toHaveBeenCalled();
  renderer.unmount();
});
