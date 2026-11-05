import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearContinueLearning,
  clearHelpReturnContext,
  readContinueLearning,
  readHelpReturnContext,
  saveContinueLearning,
  saveHelpReturnContext,
} from '../../apps/web/src/help/helpReturnContext.js';

const memory = new Map<string, string>();

function installStorage() {
  const storage = {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memory.set(k, String(v));
    },
    removeItem: (k: string) => {
      memory.delete(k);
    },
    clear: () => memory.clear(),
    key: () => null,
    length: 0,
  };
  Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
}

describe('Help return / continue-learning isolation (Phase 78)', () => {
  beforeEach(() => {
    memory.clear();
    installStorage();
  });

  it('stores return context without private bodies and rejects other accounts', () => {
    saveHelpReturnContext({
      userId: 'usr_a',
      workspaceId: 'ws_a',
      returnPath: '/journal',
      articleId: 'help.journal-privacy',
      openedAt: '2026-10-27T00:00:00.000Z',
    });
    expect(readHelpReturnContext('usr_a')?.returnPath).toBe('/journal');
    expect(readHelpReturnContext('usr_b')).toBeNull();
    clearHelpReturnContext();
    expect(readHelpReturnContext('usr_a')).toBeNull();
  });

  it('scopes Continue learning by user id', () => {
    saveContinueLearning('usr_a', 'chapter.journal');
    expect(readContinueLearning('usr_a')).toBe('chapter.journal');
    expect(readContinueLearning('usr_b')).toBeNull();
    clearContinueLearning('usr_a');
    expect(readContinueLearning('usr_a')).toBeNull();
  });
});
