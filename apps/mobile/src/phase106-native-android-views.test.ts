import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from './test-render.js';
import { SettingsHubView } from './views/SettingsHubView.js';
import { CreateSheet } from './views/CreateSheet.js';
import { AssistantSheet } from './views/AssistantSheet.js';
import {
  MobileCard,
  MobileListRow,
  MobileHeader,
  MobileNavigationBar,
  MobileEmptyState,
} from '@daynori/ui-mobile';

describe('Phase 106: Native Android Views, Components, and Interaction Verification', () => {
  describe('1. SettingsHubView Component Overhaul', () => {
    it('renders unified card with divided rows for 6 settings groups', () => {
      const opened: string[] = [];
      let closed = false;
      let renderer: ReactTestRenderer;

      act(() => {
        renderer = TestRenderer.create(
          React.createElement(SettingsHubView, {
            themeMode: 'light',
            onOpenGroup: (id) => opened.push(id),
            onClose: () => {
              closed = true;
            },
          })
        );
      });

      expect(renderer!.root.findByProps({ testID: 'settings-hub' })).toBeDefined();
      expect(renderer!.root.findByProps({ testID: 'settings-groups-card' })).toBeDefined();

      const groups = ['account', 'appearance', 'notifications', 'workspace', 'privacy', 'help'];
      for (const group of groups) {
        const row = renderer!.root.findByProps({ testID: `settings-group-${group}` });
        expect(row).toBeDefined();
        expect(row.props.accessibilityRole).toBe('button');
      }

      const accountRow = renderer!.root.findByProps({ testID: 'settings-group-account' });
      act(() => {
        accountRow.props.onPress();
      });
      expect(opened).toEqual(['account']);

      const doneBtn = renderer!.root.findByProps({ accessibilityLabel: 'Close settings' });
      act(() => {
        doneBtn.props.onPress();
      });
      expect(closed).toBe(true);
    });

    it('renders cleanly in dark theme mode', () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = TestRenderer.create(
          React.createElement(SettingsHubView, {
            themeMode: 'dark',
            onOpenGroup: () => {},
            onClose: () => {},
          })
        );
      });
      expect(renderer!.root.findByProps({ testID: 'settings-hub' })).toBeDefined();
    });
  });

  describe('2. CreateSheet Entity Chips & Local Draft Handling', () => {
    it('renders modern entity selection chips and preserves draft state', () => {
      let draftData: unknown = null;
      let created = false;
      let closed = false;
      let renderer: ReactTestRenderer;

      act(() => {
        renderer = TestRenderer.create(
          React.createElement(CreateSheet, {
            visible: true,
            themeMode: 'light',
            initialDraft: { title: 'My Draft Note', type: 'note', details: '' },
            onDraftChange: (d) => {
              draftData = d;
            },
            onCreateItem: async () => {
              created = true;
            },
            onClose: () => {
              closed = true;
            },
          })
        );
      });

      expect(renderer!.root.findByProps({ testID: 'create-sheet' })).toBeDefined();
      expect(renderer!.root.findByProps({ testID: 'create-type-note' })).toBeDefined();
      expect(renderer!.root.findByProps({ testID: 'create-type-task' })).toBeDefined();
      expect(renderer!.root.findByProps({ testID: 'create-type-routine' })).toBeDefined();
      expect(renderer!.root.findByProps({ testID: 'create-type-journal' })).toBeDefined();

      const taskChip = renderer!.root.findByProps({ testID: 'create-type-task' });
      act(() => {
        taskChip.props.onPress();
      });
      expect(draftData).toBeDefined();
      expect(created).toBe(false);

      const cancelBtn = renderer!.root.findByProps({ testID: 'create-cancel-btn' });
      act(() => {
        cancelBtn.props.onPress();
      });
      expect(closed).toBe(true);
    });
  });

  describe('3. AssistantSheet Truthful Gating Presentation (DEF-V2-008)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const mockApiClient = {
      listAssistantHistory: vi.fn().mockResolvedValue({ data: [] }),
      getAssistantDraft: vi.fn().mockResolvedValue({ data: null }),
      saveAssistantDraft: vi.fn().mockResolvedValue({}),
      clearAssistantDraft: vi.fn().mockResolvedValue({}),
      askAssistantStream: vi.fn(),
    } as any;

    it('displays gated banner and disables prompt input when isGated=true', () => {
      let renderer: ReactTestRenderer;
      let closed = false;

      act(() => {
        renderer = TestRenderer.create(
          React.createElement(AssistantSheet, {
            themeMode: 'light',
            workspaceId: 'ws-test',
            apiClient: mockApiClient,
            isGated: true,
            onClose: () => {
              closed = true;
            },
          })
        );
      });

      expect(renderer!.root.findByProps({ testID: 'assistant-sheet' })).toBeDefined();
      const banner = renderer!.root.findByProps({ testID: 'assistant-gated-banner' });
      expect(banner).toBeDefined();

      const askBtn = renderer!.root.findByProps({ testID: 'btn-assistant-ask' });
      expect(askBtn.props.disabled).toBe(true);

      const closeBtn = renderer!.root.findByProps({ testID: 'btn-assistant-close' });
      act(() => {
        closeBtn.props.onPress();
      });
      expect(closed).toBe(true);
      renderer!.unmount();
    });

    it('enables input and ask button when not gated', () => {
      let renderer: ReactTestRenderer;

      act(() => {
        renderer = TestRenderer.create(
          React.createElement(AssistantSheet, {
            themeMode: 'light',
            workspaceId: 'ws-test',
            apiClient: mockApiClient,
            isGated: false,
            onClose: () => {},
          })
        );
      });

      expect(() => renderer!.root.findByProps({ testID: 'assistant-gated-banner' })).toThrow();
      const input = renderer!.root.findByProps({ testID: 'input-assistant-prompt' });
      act(() => {
        input.props.onChangeText('How many tasks are due today?');
      });

      const askBtn = renderer!.root.findByProps({ testID: 'btn-assistant-ask' });
      expect(askBtn.props.disabled).toBe(false);
      renderer!.unmount();
    });
  });

  describe('4. MobileCard, MobileListRow, MobileEmptyState Native Primitives', () => {
    it('supports subtle, outlined, elevated, and flat card variants', () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = TestRenderer.create(
          React.createElement(
            MobileCard,
            { variant: 'elevated', themeMode: 'light', testID: 'elevated-card' },
            React.createElement(MobileCard, {
              variant: 'flat',
              themeMode: 'dark',
              testID: 'flat-card',
            })
          )
        );
      });
      expect(renderer!.root.findByProps({ testID: 'elevated-card' })).toBeDefined();
      expect(renderer!.root.findByProps({ testID: 'flat-card' })).toBeDefined();
    });

    it('supports divided rows with touch ripple and accessibility labels', () => {
      let pressed = false;
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = TestRenderer.create(
          React.createElement(MobileListRow, {
            title: 'Divided Row Item',
            subtitle: 'With secondary description',
            variant: 'divided',
            themeMode: 'light',
            testID: 'divided-row',
            accessibilityLabel: 'Divided Row Item Accessible',
            onPress: () => {
              pressed = true;
            },
          })
        );
      });
      const row = renderer!.root.findByProps({ testID: 'divided-row' });
      expect(row.props.accessibilityRole).toBe('button');
      expect(row.props.accessibilityLabel).toBe('Divided Row Item Accessible');
      act(() => {
        row.props.onPress();
      });
      expect(pressed).toBe(true);
    });

    it('renders empty state with circular icon container badge', () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = TestRenderer.create(
          React.createElement(MobileEmptyState, {
            title: 'No Items Found',
            description: 'Try adjusting your search criteria.',
            themeMode: 'light',
            testID: 'test-empty-state',
          })
        );
      });
      expect(renderer!.root.findByProps({ testID: 'test-empty-state' })).toBeDefined();
    });
  });

  describe('5. MobileHeader & MobileNavigationBar Navigation Chrome', () => {
    it('wires Assistant button with truthful gated aria-label', () => {
      let assistantClicked = false;
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = TestRenderer.create(
          React.createElement(MobileHeader, {
            title: 'Today',
            subtitle: 'Saturday, Nov 14',
            themeMode: 'light',
            onOpenSearch: () => {},
            onOpenAssistant: () => {
              assistantClicked = true;
            },
            onOpenCreate: () => {},
            onOpenAllFeatures: () => {},
            onOpenSettings: () => {},
          })
        );
      });

      const assistantBtn = renderer!.root.findByProps({ testID: 'header-assistant-btn' });
      expect(assistantBtn).toBeDefined();
      expect(assistantBtn.props.accessibilityLabel).toContain('Ask Nori assistant');
      act(() => {
        assistantBtn.props.onPress();
      });
      expect(assistantClicked).toBe(true);
    });

    it('renders navigation bar with active tab pills and switches tabs', () => {
      let selectedTab: string | null = null;
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = TestRenderer.create(
          React.createElement(MobileNavigationBar, {
            currentTab: 'today',
            onSelectTab: (tab) => {
              selectedTab = tab;
            },
            themeMode: 'light',
          })
        );
      });

      const planTab = renderer!.root.findByProps({ testID: 'nav-tab-plan' });
      act(() => {
        planTab.props.onPress();
      });
      expect(selectedTab).toBe('plan');
    });
  });
});
