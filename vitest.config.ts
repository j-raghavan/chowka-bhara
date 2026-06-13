import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/domain/**', 'src/app/**', 'src/transport/**'],
      exclude: [
        'src/**/index.ts',
        '**/*.d.ts',
        // Platform/IO glue (BroadcastChannel, real backend clients): exercised
        // in the browser / against a live backend, not unit-tested.
        'src/transport/broadcast-notifier.ts',
        'src/transport/supabase-transport.ts',
      ],
      // Domain + application + transport logic must clear 97% (project CLAUDE.md).
      thresholds: {
        statements: 97,
        branches: 97,
        functions: 97,
        lines: 97,
      },
    },
  },
});
