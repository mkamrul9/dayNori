import React from 'react';
import { expect, it, vi } from 'vitest';
import { CreateSheet } from './CreateSheet.js';
import { TestRenderer, act } from '../test-render.js';

it('retains entered content and stays open when the save fails', async () => {
  const close = vi.fn();
  const save = vi.fn().mockRejectedValue(new Error('Disk full'));
  const renderer = TestRenderer.create(
    React.createElement(CreateSheet, {
      visible: true,
      themeMode: 'light',
      onClose: close,
      onCreateItem: save,
      initialDraft: { type: 'task', title: 'Synthetic draft', details: 'Keep this text' },
    })
  );
  act(() => {
    renderer.root.findByProps({ testID: 'create-submit-btn' }).props.onPress();
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(close).not.toHaveBeenCalled();
  expect(
    renderer.root.findByProps({ testID: 'create-title-input' }).props.value
  ).toBe('Synthetic draft');
  renderer.unmount();
});

it('waits for a successful durable save before clearing the draft and closing', async () => {
  let commit: (() => void) | undefined;
  const close = vi.fn();
  const change = vi.fn();
  const save = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        commit = resolve;
      })
  );
  const renderer = TestRenderer.create(
    React.createElement(CreateSheet, {
      visible: true,
      themeMode: 'light',
      onClose: close,
      onCreateItem: save,
      onDraftChange: change,
      initialDraft: { type: 'task', title: 'Saved draft', details: '' },
    })
  );
  act(() => {
    renderer.root.findByProps({ testID: 'create-submit-btn' }).props.onPress();
    renderer.root.findByProps({ testID: 'create-submit-btn' }).props.onPress();
  });
  expect(save).toHaveBeenCalledTimes(1);
  expect(close).not.toHaveBeenCalled();
  commit?.();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(close).toHaveBeenCalledTimes(1);
  expect(change).toHaveBeenCalledWith({ type: 'task', title: '', details: '' });
  renderer.unmount();
});
