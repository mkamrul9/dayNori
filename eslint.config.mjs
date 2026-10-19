import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.expo/**',
      'apps/mobile/android/**',
      'apps/mobile/ios/**',
      'docs/**',
      'scripts/**',
      'tests/spikes/browser/**',
      'apps/mobile/metro.config.js',
      'apps/web/public/**',
      '**/next-env.d.ts',
      'artifacts/**',
      'tests/security/vault/harnesses/android-candidate/**/build/**',
      'tests/security/vault/harnesses/android-candidate/.gradle/**',
      'tests/security/vault/harnesses/node_modules/**',
    ],
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  }
);
