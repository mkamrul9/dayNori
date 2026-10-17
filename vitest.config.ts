import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@daynori/design-tokens': path.resolve(__dirname, 'packages/design-tokens/src/index.ts'),
      '@daynori/domain': path.resolve(__dirname, 'packages/domain/src/index.ts'),
      '@daynori/contracts': path.resolve(__dirname, 'packages/contracts/src/index.ts'),
      '@daynori/api-client': path.resolve(__dirname, 'packages/api-client/src/index.ts'),
      '@daynori/sync': path.resolve(__dirname, 'packages/sync/src/index.ts'),
      '@daynori/ui-web': path.resolve(__dirname, 'packages/ui-web/src/index.ts'),
      '@daynori/ui-mobile': path.resolve(__dirname, 'packages/ui-mobile/src/index.ts'),
      '@daynori/test-utils': path.resolve(__dirname, 'packages/test-utils/src/index.ts'),
      'react-native': path.resolve(__dirname, 'packages/test-utils/src/mock-react-native.ts'),
      'expo-status-bar': path.resolve(__dirname, 'packages/test-utils/src/mock-expo-status-bar.ts'),
      'expo-file-system': path.resolve(__dirname, 'packages/test-utils/src/mock-expo-file-system.ts'),
      'expo-document-picker': path.resolve(__dirname, 'packages/test-utils/src/mock-expo-document-picker.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/**/*.test.ts',
      'packages/**/*.test.tsx',
      'apps/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
  },
});
