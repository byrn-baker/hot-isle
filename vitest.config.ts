import { defineConfig, configDefaults } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@/systems': resolve(__dirname, 'src/systems'),
      '@/scenes': resolve(__dirname, 'src/scenes'),
      '@/entities': resolve(__dirname, 'src/entities'),
      '@/ui': resolve(__dirname, 'src/ui'),
      '@/data': resolve(__dirname, 'src/data'),
      '@/utils': resolve(__dirname, 'src/utils'),
      '@/types': resolve(__dirname, 'src/types/index.ts'),
    },
  },
  test: {
    exclude: [...configDefaults.exclude, 'tests/browser/**'],
    globals: true,
    environment: 'node',
  },
});
