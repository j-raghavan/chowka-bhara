import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // UI tests use the in-memory transport (no real BroadcastChannel under jsdom).
  define: { 'import.meta.env.VITE_TRANSPORT': '"memory"' },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Gate the pure LOGIC: domain rules, application services, transports.
      // React hooks/components/pages are UI — measured separately, not 97%-gated
      // (ADR test policy). Pure app helpers (env, identity, hash-route) are still
      // tested for confidence, just not part of this gate.
      include: ['src/domain/**', 'src/app/services/**', 'src/transport/**'],
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
