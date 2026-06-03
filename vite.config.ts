import { defineConfig } from 'vite';
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
      '@/services': resolve(__dirname, 'src/services'),
      '@/types': resolve(__dirname, 'src/types/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'es2020',
  },
  publicDir: 'public',
});
