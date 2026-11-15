import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  colors,
  focusRing,
  getContrastRatio,
  meetsWcagAA,
  touchTargets,
} from '@daynori/design-tokens';
import { getOrganizerDeepLink, sanitizeAssistantMarkdown } from '@daynori/domain';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 114: Ask Nori Web and Mobile Interface Verification', () => {
  describe('1. Web AssistantPanel Interface Inspection', () => {
    it('verifies AssistantPanel renders truthful gated banner and disables input when gated under DEF-V2-008', () => {
      const panelFile = path.join(repoRoot, 'apps/web/src/components/AssistantPanel.tsx');
      const content = fs.readFileSync(panelFile, 'utf8');

      // Gated banner verification
      expect(content).toContain('data-testid="assistant-gated-banner"');
      expect(content).toContain('DEF-V2-008');
      expect(content).toContain("cursor: isGated ? 'not-allowed' : 'text'");
      expect(content).toContain('disabled={isGated}');
      expect(content).toContain('disabled={isGated || busy || !personalWorkspaceId || !question.trim()}');

      // Auxiliary controls (knowledge sources, starter suggestions, voice recording) collapsed when gated
      expect(content).toContain('!isGated && (');
    });

    it('verifies AssistantPanel proposal review lifecycle: edit, confirm, durable receipt, deep link, and cancel', () => {
      const panelFile = path.join(repoRoot, 'apps/web/src/components/AssistantPanel.tsx');
      const content = fs.readFileSync(panelFile, 'utf8');

      // Editing proposal state and handlers
      expect(content).toContain('startEditProposal');
      expect(content).toContain('saveEditedProposal');
      expect(content).toContain('client.updateAiProposal');

      // Confirmation handler and mutation receipt notice
      expect(content).toContain('confirmProposal');
      expect(content).toContain('client.confirmAiProposal');
      expect(content).toContain('Action confirmed and saved! Cloud mutation receipt created.');

      // Deep link navigation
      expect(content).toContain('openCreatedItem');
      expect(content).toContain('getOrganizerDeepLink');

      // Cancellation handler
      expect(content).toContain('cancelProposal');
      expect(content).toContain('client.cancelAiProposal');
      expect(content).toContain('Proposal cancelled. No items were created or modified.');

      // In-flight ask cancellation
      expect(content).toContain('cancelAsk');
      expect(content).toContain('askAbortRef.current?.abort()');
    });

    it('verifies Desktop Header and Sidebar surface Ask Nori with truthful gated presentation', () => {
      const headerFile = path.join(repoRoot, 'apps/web/src/components/AppHeader.tsx');
      const headerContent = fs.readFileSync(headerFile, 'utf8');
      expect(headerContent).toContain('Ask Nori assistant (Gated under DEF-V2-008)');

      const sidebarFile = path.join(repoRoot, 'apps/web/src/components/AppSidebar.tsx');
      const sidebarContent = fs.readFileSync(sidebarFile, 'utf8');
      expect(sidebarContent).toContain('Ask Nori');
      expect(sidebarContent).toContain('Gated');
    });
  });

  describe('2. Mobile Native Assistant Views & Launcher Code Inspection', () => {
    it('verifies AssistantSheet component preserves DEF-V2-008 gating banner and controls', () => {
      const sheetFile = path.join(repoRoot, 'apps/mobile/src/views/AssistantSheet.tsx');
      const content = fs.readFileSync(sheetFile, 'utf8');

      expect(content).toContain('testID="assistant-gated-banner"');
      expect(content).toContain('DEF-V2-008');
      expect(content).toContain('testID="input-assistant-prompt"');
      expect(content).toContain('testID="btn-assistant-ask"');
      expect(content).toContain('testID="btn-assistant-close"');
    });

    it('verifies Mobile Companion Launcher wires Ask Nori with truthful accessibility hints', () => {
      const launcherFile = path.join(repoRoot, 'apps/mobile/src/views/NoriCompanionLauncher.tsx');
      const content = fs.readFileSync(launcherFile, 'utf8');
      expect(content).toContain('Opens Ask Nori daily assistant');
      expect(content).toContain('onPress');
    });
  });

  describe('3. Canonical Deep Link Generator Invariants', () => {
    it('generates canonical deep links for note, task, and journal entities', () => {
      expect(getOrganizerDeepLink('note', 'note-uuid-001')).toBe('/library?noteId=note-uuid-001');
      expect(getOrganizerDeepLink('task', 'task-uuid-002')).toBe('/plan?targetId=task-uuid-002&targetType=task');
      expect(getOrganizerDeepLink('journal_entry', 'entry-uuid-003')).toBe('/journal?entryId=entry-uuid-003');
    });

    it('sanitizes assistant markdown to prevent XSS and malicious scripts', () => {
      const dangerous = '<script>alert("xss")</script> **Grounded answer** [source:item-1#r1]';
      const clean = sanitizeAssistantMarkdown(dangerous);
      expect(clean).not.toContain('<script>');
      expect(clean).toContain('**Grounded answer**');
    });
  });

  describe('4. Mobile and Web Design Accessibility Standards', () => {
    it('enforces touch targets and surface contrast for assistant controls', () => {
      expect(touchTargets.mobileMin).toBeGreaterThanOrEqual(48);
      expect(touchTargets.webMin).toBeGreaterThanOrEqual(44);

      const light = colors.light;
      const dark = colors.dark;
      expect(meetsWcagAA(light.text.primary, light.background)).toBe(true);
      expect(meetsWcagAA(dark.text.primary, dark.background)).toBe(true);
      expect(focusRing.width).toBeGreaterThanOrEqual(2);
    });
  });
});
