import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Set VITE_BASE_PATH=/repository-name/ for a GitHub Pages project site.
  base: process.env.VITE_BASE_PATH ?? '/',
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
