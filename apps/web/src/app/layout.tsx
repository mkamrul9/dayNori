import type { Metadata } from 'next';
import React from 'react';
import './globals.css';
import { AuthProvider } from '../components/AuthContext';
import { ShellProvider } from '../components/ShellContext';
import { AppShell } from '../components/AppShell';

export const metadata: Metadata = {
  title: 'Daynori — Your day, gathered',
  description:
    'A customizable home for notes, routines, tasks, journals, files, and everyday life.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
