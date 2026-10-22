import type { Metadata, Viewport } from 'next';
import React from 'react';
import { connection } from 'next/server';
import './globals.css';
import { AuthProvider } from '../components/AuthContext';
import { ShellProvider } from '../components/ShellContext';
import { AppShell } from '../components/AppShell';

export const metadata: Metadata = {
  title: 'Daynori — Your day, gathered',
  description:
    'A customizable home for notes, routines, tasks, journals, files, and everyday life.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48', type: 'image/x-icon' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = { themeColor: '#146B63' };

/**
 * Opt the tree into dynamic rendering so middleware CSP nonces can be applied to scripts.
 * Static prerender cannot inject per-request nonces (Next.js 15 CSP guide).
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <ShellProvider>
            <AppShell>{children}</AppShell>
          </ShellProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
