'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { NoriCompanionPosition, NoriCompanionPreferences, NoriCompanionState } from '@daynori/contracts';
import {
  calculateNoriSafeCoordinates,
  getNoriStateAccessibilityLabel,
  resolveNoriState,
  shouldReduceNoriMotion,
} from '@daynori/domain';
import { colors, radii, spacing, typography } from '@daynori/design-tokens';
import { Icon } from '@daynori/ui-web';
import { NoriAvatar } from './NoriAvatar';

export interface NoriCompanionLauncherProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  themeMode?: 'light' | 'dark';
  preferences?: NoriCompanionPreferences;
  onUpdatePreferences?: (prefs: Partial<NoriCompanionPreferences>) => Promise<void>;
  // Live states driven from assistant and device status
  isListening?: boolean;
  isThinking?: boolean;
  isSuccess?: boolean;
  isError?: boolean;
  isOffline?: boolean;
  isQuietHours?: boolean;
  isNarrow?: boolean;
  bottomNavHeight?: number;
  bannerHeight?: number;
}

export function NoriCompanionLauncher({
  isOpen,
  onToggleOpen,
  themeMode = 'light',
  preferences = { enabled: true, position: 'bottom-right', reducedMotion: false },
  onUpdatePreferences,
  isListening = false,
  isThinking = false,
  isSuccess = false,
  isError = false,
  isOffline = false,
  isQuietHours = false,
  isNarrow = false,
  bottomNavHeight = 56,
  bannerHeight = 0,
}: NoriCompanionLauncherProps) {
  const isDark = themeMode === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);

  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const wasOpenRef = useRef<boolean>(isOpen);

  // Detect system reduced motion preference
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setSystemReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setSystemReducedMotion(e.matches);
    mediaQuery.addEventListener?.('change', handler);
    return () => mediaQuery.removeEventListener?.('change', handler);
  }, []);

  const isReducedMotion = shouldReduceNoriMotion(preferences, systemReducedMotion);

  // Restore focus to launcher button when assistant drawer is closed
  useEffect(() => {
    if (wasOpenRef.current && !isOpen) {
      launcherRef.current?.focus();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  // Derive truthful Nori state
  const currentState: NoriCompanionState = resolveNoriState({
    isAssistantOpen: isOpen,
    isListening,
    isThinking,
    isSuccess,
    isError,
    isOffline,
    isQuietHours,
    isHoveredOrFocused: hovered || focused,
  });

  const position: NoriCompanionPosition = preferences.position || 'bottom-right';

  // Compute safe coordinates ensuring no collision with bottom navigation or banners
  const coordinates = calculateNoriSafeCoordinates(position, {
    bottomNavHeight: isNarrow ? bottomNavHeight : 0,
    bannerHeight,
    bottom: isNarrow ? 12 : 16,
    right: 16,
    left: 16,
    top: 16,
  });

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && showMenu) {
        setShowMenu(false);
        launcherRef.current?.focus();
        e.stopPropagation();
      }
    },
    [showMenu]
  );

  const handlePositionChange = async (nextPos: NoriCompanionPosition) => {
    setShowMenu(false);
    if (onUpdatePreferences) {
      await onUpdatePreferences({ position: nextPos });
    }
  };

  const handleToggleReducedMotion = async () => {
    setShowMenu(false);
    if (onUpdatePreferences) {
      await onUpdatePreferences({ reducedMotion: !preferences.reducedMotion });
    }
  };

  const handleHideCompanion = async () => {
    setShowMenu(false);
    if (onUpdatePreferences) {
      await onUpdatePreferences({ enabled: false });
    }
  };

  // If user disabled the floating companion, do not render it (labeled button remains available)
  if (preferences.enabled === false) {
    return null;
  }

  const label = getNoriStateAccessibilityLabel(currentState);

  return (
    <aside
      aria-label="Assistant companion launcher widget"
      style={{
        position: 'fixed',
        zIndex: 90, // Above normal content, below active modals (100)
        ...coordinates,
      }}
      onKeyDown={handleKeyDown}
    >
      <div style={{ position: 'relative' }}>
        {/* Main Floating Launcher Button */}
        <button
          ref={launcherRef}
          id="nori-companion-launcher"
          data-testid="nori-companion-launcher"
          data-tour="assistant-companion-launcher"
          type="button"
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          title={`${label}. Click to open Ask Nori.`}
          onClick={onToggleOpen}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onContextMenu={(e) => {
            e.preventDefault();
            setShowMenu((prev) => !prev);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 52,
            height: 52,
            padding: 0,
            borderRadius: radii.pill,
            backgroundColor: isDark ? palette.surfaceRaised : '#FFFFFF',
            border: `2px solid ${
              focused ? palette.border.focus : (isDark ? '#3D4D4D' : '#D9DFDC')
            }`,
            boxShadow: isDark
              ? '0 4px 16px rgba(0, 0, 0, 0.45)'
              : '0 4px 14px rgba(20, 107, 99, 0.16)',
            cursor: 'pointer',
            outline: focused ? `2px solid ${palette.border.focus}` : 'none',
            outlineOffset: 2,
            transition: isReducedMotion
              ? 'none'
              : 'transform 180ms cubic-bezier(0, 0, 0.2, 1), box-shadow 180ms cubic-bezier(0, 0, 0.2, 1)',
            transform: hovered && !isReducedMotion ? 'scale(1.06)' : 'scale(1)',
          }}
        >
          <NoriAvatar
            state={currentState}
            size={38}
            themeMode={themeMode}
            reducedMotion={isReducedMotion}
          />
        </button>

        {/* Small Companion Options Cog / Context Trigger */}
        <button
          type="button"
          aria-label="Nori companion settings"
          title="Companion settings (change corner, reduce motion, hide)"
          data-testid="nori-companion-settings-btn"
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu((prev) => !prev);
          }}
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            width: 20,
            height: 20,
            borderRadius: radii.pill,
            backgroundColor: isDark ? '#253535' : '#E4EFEA',
            border: `1px solid ${palette.border.subtle}`,
            color: palette.text.secondary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <Icon name="settings" size={12} />
        </button>

        {/* Companion Settings Popover Menu */}
        {showMenu && (
          <div
            role="menu"
            aria-label="Nori companion options"
            data-testid="nori-companion-menu"
            style={{
              position: 'absolute',
              bottom: position.startsWith('bottom') ? 60 : 'auto',
              top: position.startsWith('top') ? 60 : 'auto',
              right: position.endsWith('right') ? 0 : 'auto',
              left: position.endsWith('left') ? 0 : 'auto',
              width: 220,
              backgroundColor: isDark ? palette.surface : '#FFFFFF',
              border: `1px solid ${palette.border.strong}`,
              borderRadius: radii.md,
              boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
              padding: spacing.sm,
              zIndex: 95,
              fontFamily: typography.fontFamily.sans,
              fontSize: `${typography.webScale.supporting}px`,
              color: palette.text.primary,
            }}
          >
            <div
              style={{
                fontWeight: 600,
                marginBottom: spacing.xs,
                fontSize: 12,
                color: palette.text.secondary,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Nori Companion
            </div>

            {/* Corner Placement Selection */}
            <div style={{ marginBottom: spacing.xs }}>
              <div style={{ fontSize: 12, marginBottom: 4 }}>Position:</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                {(['bottom-right', 'bottom-left', 'top-right', 'top-left'] as NoriCompanionPosition[]).map(
                  (pos) => (
                    <button
                      key={pos}
                      type="button"
                      data-testid={`nori-pos-${pos}`}
                      onClick={() => handlePositionChange(pos)}
                      style={{
                        padding: '4px 6px',
                        fontSize: 11,
                        borderRadius: radii.sm,
                        border: `1px solid ${
                          position === pos ? palette.action.primary : palette.border.subtle
                        }`,
                        backgroundColor:
                          position === pos
                            ? isDark
                              ? '#173D39'
                              : '#E4EFEA'
                            : 'transparent',
                        color: palette.text.primary,
                        cursor: 'pointer',
                      }}
                    >
                      {pos.replace('-', ' ')}
                    </button>
                  )
                )}
              </div>
            </div>

            <hr style={{ margin: `${spacing.xs}px 0`, borderColor: palette.border.subtle }} />

            {/* Reduced Motion Toggle */}
            <button
              type="button"
              data-testid="nori-toggle-motion"
              onClick={handleToggleReducedMotion}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                textAlign: 'left',
                padding: '6px 8px',
                fontSize: 12,
                background: 'transparent',
                border: 'none',
                color: palette.text.primary,
                cursor: 'pointer',
                borderRadius: radii.sm,
              }}
            >
              {preferences.reducedMotion && <Icon name="check" size={12} />}
              <span>{preferences.reducedMotion ? 'Motion reduced' : 'Reduce motion'}</span>
            </button>

            {/* Hide Companion */}
            <button
              type="button"
              data-testid="nori-hide-btn"
              onClick={handleHideCompanion}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '6px 8px',
                fontSize: 12,
                background: 'transparent',
                border: 'none',
                color: palette.action.danger,
                cursor: 'pointer',
                borderRadius: radii.sm,
              }}
            >
              Hide companion (use Ask Nori button)
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
