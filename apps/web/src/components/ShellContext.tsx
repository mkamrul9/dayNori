'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { colors, type ThemeMode } from '@daynori/design-tokens';

export type ShellModal = 'search' | 'create' | 'help' | 'account' | 'onboarding' | 'onboarding-replay' | 'sync-diagnostics' | 'recovery-export' | 'conflict-review' | 'workspace-portability' | null;
export type ThemePreference = 'system' | 'light' | 'dark';

export interface ShellContextType {
  themeMode: ThemeMode;
  themePreference: ThemePreference;
  toggleTheme: () => void;
  setTheme: (mode: ThemePreference) => void;
  textScale: number;
  setTextScale: (scale: number) => void;
  direction: 'ltr' | 'rtl';
  setDirection: (dir: 'ltr' | 'rtl') => void;
  language: 'en' | 'bn';
  setLanguage: (lang: 'en' | 'bn') => void;
  activeModal: ShellModal;
  openModal: (modal: ShellModal) => void;
  closeModal: () => void;
  isMobileDrawerOpen: boolean;
  setMobileDrawerOpen: (open: boolean) => void;
  routeAnnouncement: string;
  shortcutsEnabled: boolean;
  setShortcutsEnabled: (enabled: boolean) => void;
}

const ShellContext = createContext<ShellContextType | undefined>(undefined);

export const useShell = () => {
  const context = useContext(ShellContext);
  if (!context) {
    throw new Error('useShell must be used within a ShellProvider');
  }
  return context;
};

export const ShellProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const pathname = usePathname();

  const [themePreference, setThemePreference] = useState<ThemePreference>('system');
  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemIsDark(e.matches);
    };
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, []);

  const themeMode: ThemeMode =
    themePreference === 'system' ? (systemIsDark ? 'dark' : 'light') : themePreference;

  const toggleTheme = () => {
    setThemePreference((prev) => {
      const currentEffective = prev === 'system' ? (systemIsDark ? 'dark' : 'light') : prev;
      return currentEffective === 'light' ? 'dark' : 'light';
    });
  };

  const setTheme = (mode: ThemePreference) => {
    setThemePreference(mode);
  };

  const [textScale, setTextScale] = useState<number>(100);
  const [direction, setDirection] = useState<'ltr' | 'rtl'>('ltr');
  const [language, setLanguage] = useState<'en' | 'bn'>('en');
  const [activeModal, setActiveModal] = useState<ShellModal>(null);
  const [isMobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [routeAnnouncement, setRouteAnnouncement] = useState('');
  const [shortcutsEnabled, setShortcutsEnabled] = useState<boolean>(true);

  // Synchronize data-theme attribute on <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
    document.documentElement.style.colorScheme = themeMode;
    document.documentElement.dir = direction;
  }, [themeMode, direction]);

  // Announce route changes to assistive technology
  useEffect(() => {
    let name = 'Home';
    if (pathname.startsWith('/today')) name = 'Today';
    else if (pathname.startsWith('/plan/calendar')) name = 'Plan: Calendar';
    else if (pathname.startsWith('/plan')) name = 'Plan';
    else if (pathname.startsWith('/library')) name = 'Library';
    else if (pathname.startsWith('/journal')) name = 'Journal';
    else if (pathname.startsWith('/settings')) name = 'Settings';
    else if (pathname.startsWith('/help')) name = 'Help';
    else if (pathname.startsWith('/review')) name = 'Component Gallery Review';
    setRouteAnnouncement(`Navigated to ${name} view`);
    setMobileDrawerOpen(false);
  }, [pathname]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Respect user typing in inputs, textareas, selects, or contenteditable
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditable = target?.isContentEditable || false;

      if (tag === 'input' || tag === 'textarea' || tag === 'select' || isEditable) {
        if (e.key === 'Escape') {
          setActiveModal(null);
          setMobileDrawerOpen(false);
        }
        return;
      }

      // Check modifier keys: don't intercept browser shortcuts like Ctrl+T or Cmd+R
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      // Always allow Escape for modal / drawer dismissal
      if (e.key === 'Escape') {
        setActiveModal(null);
        setMobileDrawerOpen(false);
        return;
      }

      // WCAG 2.1.4: Character Key Shortcuts must be disablable
      if (!shortcutsEnabled) {
        return;
      }

      switch (e.key) {
        case '?':
        case 'h':
          e.preventDefault();
          setActiveModal('help');
          break;
        case '/':
        case 's':
          e.preventDefault();
          setActiveModal('search');
          break;
        case 'c':
          e.preventDefault();
          setActiveModal('create');
          break;
        case 't':
          e.preventDefault();
          router.push('/today');
          break;
        case 'p':
          e.preventDefault();
          router.push('/plan');
          break;
        case 'k':
          e.preventDefault();
          router.push('/plan/calendar');
          break;
        case 'l':
          e.preventDefault();
          router.push('/library');
          break;
        case 'j':
          e.preventDefault();
          router.push('/journal');
          break;
        case ',':
          e.preventDefault();
          router.push('/settings');
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router, shortcutsEnabled]);

  const openModal = (modal: ShellModal) => {
    setActiveModal(modal);
  };

  const closeModal = () => {
    setActiveModal(null);
  };

  const palette = colors[themeMode];

  return (
    <ShellContext.Provider
      value={{
        themeMode,
        themePreference,
        toggleTheme,
        setTheme,
        textScale,
        setTextScale,
        direction,
        setDirection,
        language,
        setLanguage,
        activeModal,
        openModal,
        closeModal,
        isMobileDrawerOpen,
        setMobileDrawerOpen,
        routeAnnouncement,
        shortcutsEnabled,
        setShortcutsEnabled,
      }}
    >
      <div
        dir={direction}
        style={{
          backgroundColor: palette.background,
          color: palette.text.primary,
          minHeight: '100vh',
          fontSize: `${(16 * textScale) / 100}px`,
          lineHeight: 1.5,
          fontFamily:
            language === 'bn' ? 'var(--font-bangla), var(--font-sans)' : 'var(--font-sans)',
          transition: 'background-color 150ms ease, color 150ms ease',
        }}
      >
        {children}
      </div>
    </ShellContext.Provider>
  );
};
