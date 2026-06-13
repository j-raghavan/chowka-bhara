import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves from /<repo>/. Override with VITE_BASE at build time.
// e.g. VITE_BASE=/chowka-bhara-online/ npm run build
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Keep the (lazy) Supabase client in its own named chunk so it never
        // lands in the entry bundle and the size budget measures initial load only.
        manualChunks(id) {
          if (id.includes('@supabase')) return 'supabase';
          return undefined;
        },
      },
    },
  },
});
