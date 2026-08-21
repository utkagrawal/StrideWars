import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
    // Prevents tests from hanging indefinitely when async work (e.g. XHR in jsdom)
    // does not resolve — ensures a clear failure message instead of a silent hang.
    testTimeout: 10000,
    // Automatically mock-reset between tests to avoid state bleed
    mockReset: false,
    clearMocks: false,
  },
});
