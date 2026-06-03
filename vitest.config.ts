import { defineConfig } from 'vitest/config';
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
    globals: true,
    environment: 'node',
  },
});
