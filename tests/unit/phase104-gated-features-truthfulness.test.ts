import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 104: Gated Features Truthfulness and Barrier Verification', () => {
  const registerPath = path.join(root, 'docs/roadmap/v2/function-register.json');
  const register = JSON.parse(fs.readFileSync(registerPath, 'utf8')) as {
    actions: Array<{ id: string; status: string; blockerOrDefect?: string }>;
    defects: Array<{ id: string; title: string; affectedActions: string[]; workaround: string }>;
  };

  it('verifies DEF-V2-008 defect registration and affected action mapping', () => {
    const def = register.defects.find((d) => d.id === 'DEF-V2-008');
    expect(def).toBeDefined();
    expect(def?.title).toMatch(/Live AI assistant unavailable/i);
    expect(def?.affectedActions).toEqual(
      expect.arrayContaining([
        'assistant.consent',
        'assistant.ask-grounded',
        'assistant.propose-confirm',
        'assistant.voice-capture',
        'assistant.nori-launcher',
      ])
    );
    expect(def?.workaround).toMatch(/mock/i);
  });

  it('verifies all 5 assistant actions are marked as blocked under DEF-V2-008 in the function register', () => {
    const assistantActions = [
      'assistant.consent',
      'assistant.ask-grounded',
      'assistant.propose-confirm',
      'assistant.voice-capture',
      'assistant.nori-launcher',
    ];

    for (const actionId of assistantActions) {
      const action = register.actions.find((a) => a.id === actionId);
      expect(action).toBeDefined();
      expect(action?.readiness).toBe('blocked');
      expect(action?.blockerOrDefect).toBe('DEF-V2-008');
    }
  });

  it('verifies vault, rooms, and billing actions are strictly marked blocked under their respective defects', () => {
    const vaultAction = register.actions.find((a) => a.id === 'vault.setup-unlock');
    expect(vaultAction?.readiness).toBe('blocked');
    expect(vaultAction?.blockerOrDefect).toBe('DEF-V2-004');

    const roomsAction = register.actions.find((a) => a.id === 'rooms.create-invite');
    expect(roomsAction?.readiness).toBe('blocked');
    expect(roomsAction?.blockerOrDefect).toBe('DEF-V2-006');

    const billingAction = register.actions.find((a) => a.id === 'billing.catalog-entitlement');
    expect(billingAction?.readiness).toBe('blocked');
    expect(billingAction?.blockerOrDefect).toBe('DEF-V2-007');
  });

  it('verifies privacy policy and terms explicitly disclose disabled optional modules', () => {
    const privacyPath = path.join(root, 'apps/web/src/app/privacy/page.tsx');
    const termsPath = path.join(root, 'apps/web/src/app/terms/page.tsx');

    const privacyContent = fs.readFileSync(privacyPath, 'utf8');
    const termsContent = fs.readFileSync(termsPath, 'utf8');

    // Both files must explicitly state that optional modules remain disabled and cannot be marketed as available
    expect(privacyContent).toMatch(/vault, rooms\/chat, live AI, production billing/i);
    expect(termsContent).toMatch(/vault, rooms\/chat/i);
  });

  it('verifies AssistantPanel and AppHeader truthfully present gated status', () => {
    const panelPath = path.join(root, 'apps/web/src/components/AssistantPanel.tsx');
    const headerPath = path.join(root, 'apps/web/src/components/AppHeader.tsx');

    const panelContent = fs.readFileSync(panelPath, 'utf8');
    const headerContent = fs.readFileSync(headerPath, 'utf8');

    expect(panelContent).toContain('assistant-gated-banner');
    expect(panelContent).toContain('DEF-V2-008');
    expect(panelContent).toContain('cursor: isGated ? \'not-allowed\' : \'text\'');
    expect(headerContent).toContain('aria-label="Ask Nori assistant (Gated under DEF-V2-008)"');
  });
});
