'use client';

import React from 'react';
import { colors, radii, spacing, touchTargets } from '@daynori/design-tokens';
import { useShell } from './ShellContext';

export const AppHeader: React.FC = () => {
  const { themeMode, toggleTheme, openModal, isMobileDrawerOpen, setMobileDrawerOpen } = useShell();
  const palette = colors[themeMode];

  const buttonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: `${touchTargets.webMin}px`,
    minWidth: `${touchTargets.webMin}px`,
    padding: `0 ${spacing.sm}px`,
    borderRadius: `${radii.sm}px`,
    border: `1px solid ${palette.border.subtle}`,
    backgroundColor: palette.surface,
    color: palette.text.primary,
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'background-color 150ms ease, border-color 150ms ease',
  };

  return (
    <header
      role="banner"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `0 ${spacing.base}px`,
        height: '60px',
        backgroundColor: palette.surface,
        borderBottom: `1px solid ${palette.border.subtle}`,
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      {/* Brand & Drawer Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
        <button
          type="button"
          aria-label="Toggle navigation drawer"
          aria-expanded={isMobileDrawerOpen}
          aria-controls="mobile-nav-drawer"
          onClick={() => setMobileDrawerOpen(!isMobileDrawerOpen)}
          style={{
            ...buttonStyle,
            display: 'flex',
          }}
          className="mobile-only"
        >
          <span aria-hidden="true" style={{ fontSize: '18px' }}>
            ☰
          </span>
        </button>

        <a
          href="/today"
          style={{
            textDecoration: 'none',
            color: palette.text.primary,
            display: 'flex',
            alignItems: 'baseline',
            gap: `${spacing.xs}px`,
            minHeight: `${touchTargets.webMin}px`,
            lineHeight: `${touchTargets.webMin}px`,
          }}
        >
          <span
            style={{
              fontSize: '20px',
              fontWeight: 800,
              letterSpacing: '-0.5px',
              color: palette.action.primary,
            }}
          >
            Daynori
          </span>
          <span
            className="desktop-only"
            style={{
              fontSize: '12px',
              color: palette.text.secondary,
              fontWeight: 500,
            }}
          >
            gathered
          </span>
        </a>
      </div>

      {/* Global Shell Actions */}
      <div
        role="toolbar"
        aria-label="Quick actions"
        style={{ display: 'flex', alignItems: 'center', gap: `${spacing.xs}px` }}
      >
        <button
          type="button"
          id="global-search-btn"
          aria-label="Search items (Shortcut /)"
          onClick={() => openModal('search')}
          style={buttonStyle}
        >
          <span aria-hidden="true" style={{ marginRight: '4px' }}>
            🔍
          </span>
          <span className="desktop-only">Search</span>
          <kbd
            className="desktop-only"
            style={{
              marginLeft: '6px',
              fontSize: '11px',
              padding: '2px 5px',
              borderRadius: '4px',
              backgroundColor: palette.surfaceRaised,
              border: `1px solid ${palette.border.strong}`,
              color: palette.text.secondary,
            }}
          >
            /
          </kbd>
        </button>

        <button
          type="button"
          id="global-create-btn"
          aria-label="Create item (Shortcut C)"
          onClick={() => openModal('create')}
          style={{
            ...buttonStyle,
            backgroundColor: palette.action.primary,
            color: palette.action.label,
            borderColor: palette.action.primary,
          }}
        >
          <span aria-hidden="true" style={{ marginRight: '4px', fontWeight: 'bold' }}>
            ＋
          </span>
          <span>Create</span>
          <kbd
            className="desktop-only"
            style={{
              marginLeft: '6px',
              fontSize: '11px',
              padding: '2px 5px',
              borderRadius: '4px',
              backgroundColor: 'rgba(255,255,255,0.2)',
              color: palette.action.label,
            }}
          >
            C
          </kbd>
        </button>

        <button
          type="button"
          id="global-theme-toggle"
          aria-label={`Switch to ${themeMode === 'light' ? 'dark' : 'light'} theme`}
          onClick={toggleTheme}
          style={buttonStyle}
        >
          <span aria-hidden="true">{themeMode === 'light' ? '🌙' : '☀️'}</span>
        </button>

        <button
          type="button"
          id="global-help-btn"
          aria-label="Help and keyboard shortcuts (Shortcut ?)"
          onClick={() => openModal('help')}
          style={buttonStyle}
        >
          <span aria-hidden="true">❓</span>
        </button>

        <button
          type="button"
          id="global-account-btn"
          aria-label="Account and workspace profile"
          onClick={() => openModal('account')}
          style={buttonStyle}
        >
          <span aria-hidden="true">👤</span>
        </button>
      </div>
    </header>
  );
};
