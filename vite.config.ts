import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages project-site path. Override when deploying elsewhere.
  base: process.env.VITE_BASE_PATH ?? '/TrainingDash/',
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
