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
  },
  // Browser-injected vault harness scripts (Node launches them inside a page context).
  {
    files: ['tests/security/vault/harnesses/**/*.{mjs,js}'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        BroadcastChannel: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
      },
    },
  },
  // CommonJS KDF worker + Node spike runners.
  {
    files: ['tests/security/vault/**/*.cjs', 'tests/spikes/drive/**/*.{mjs,js,ts}'],
    languageOptions: {
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  }
);
