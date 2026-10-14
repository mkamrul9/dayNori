import { describe, expect, it } from 'vitest';
import { Button, Card, Dialog, Feedback, ListRow, TextField } from './index.js';

describe('UI Web Primitives Accessibility & Contract', () => {
  it('exports all core accessible primitives', () => {
    expect(Button).toBeDefined();
    expect(Card).toBeDefined();
    expect(TextField).toBeDefined();
    expect(Dialog).toBeDefined();
    expect(Feedback).toBeDefined();
    expect(ListRow).toBeDefined();
  });
});
