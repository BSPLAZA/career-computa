import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Convex deployment URL comes from the repo-root .convex-url file written by
// the convex lane. Absent file means mock mode.
function convexUrl(): string {
  try {
    return readFileSync(resolve(__dirname, '../.convex-url'), 'utf8').trim();
  } catch {
    return '';
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __CONVEX_URL__: JSON.stringify(convexUrl()),
  },
  server: {
    fs: {
      // allow importing ../contracts/schema.ts and ../convex/_generated
      allow: ['..'],
    },
  },
});
