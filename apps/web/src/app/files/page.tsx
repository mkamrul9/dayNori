'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { colors, typography } from '@daynori/design-tokens';
import { useShell } from '../../components/ShellContext';

export default function FilesPage() {
  const router = useRouter();
  const { themeMode } = useShell();
  const palette = colors[themeMode];

  useEffect(() => {
    router.replace('/library?type=files');
  }, [router]);

  return (
    <div
      style={{
        padding: 32,
        textAlign: 'center',
        color: palette.text.secondary,
        fontFamily: typography.fontFamily.sans,
      }}
    >
      <p>Redirecting to Workspace Files & Documents...</p>
    </div>
  );
}
