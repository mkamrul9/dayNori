import { describe, expect, it } from 'vitest';
import App from '../App.js';

describe('Mobile Application Shell', () => {
  it('exports root component App', () => {
    expect(App).toBeDefined();
    expect(typeof App).toBe('function');
  });
});
