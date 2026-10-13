import { describe, expect, it } from 'vitest';
import { Button, Card } from './index.js';

describe('UI Web Primitives', () => {
  it('exports functional component definitions', () => {
    expect(Button).toBeDefined();
    expect(Card).toBeDefined();
  });
});
