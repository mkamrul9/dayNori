import { describe, expect, it } from 'vitest';
import { iconPaths, resolveIconName, splitIconText, type IconName } from './icons.js';

describe('shared icon registry', () => {
  it('exposes a coherent set of semantic icon names', () => {
    const names = Object.keys(iconPaths) as IconName[];
    expect(names.length).toBeGreaterThan(40);
    expect(names).toEqual(expect.arrayContaining(['search', 'folder', 'note', 'check', 'warning']));
    for (const name of names) {
      expect(iconPaths[name].length).toBeGreaterThan(0);
      for (const path of iconPaths[name]) {
        expect(path.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('resolves semantic names directly and maps legacy glyphs for saved metadata', () => {
    expect(resolveIconName('folder')).toBe('folder');
    expect(resolveIconName('📁')).toBe('folder');
    expect(resolveIconName('⚙︎')).toBe('settings');
    expect(resolveIconName('ℹ')).toBe('info');
  });

  it('falls back to file for unknown glyphs without throwing', () => {
    expect(resolveIconName('not-an-icon')).toBe('file');
  });

  it('splits application-authored labels without rewriting plain text', () => {
    expect(splitIconText('Open settings')).toEqual([{ kind: 'text', text: 'Open settings' }]);
    expect(splitIconText('📁 Inbox')).toEqual([
      { kind: 'icon', name: 'folder' },
      { kind: 'text', text: ' Inbox' },
    ]);
  });
});
