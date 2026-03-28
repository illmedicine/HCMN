import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { writeFileSync, readFileSync } from 'fs'

// Copy index.html → 404.html after build so GitHub Pages SPA routing works
function spa404Plugin() {
  return {
    name: 'spa-404',
    closeBundle() {
      const out = resolve('dist', 'index.html');
      try {
        writeFileSync(resolve('dist', '404.html'), readFileSync(out));
      } catch { /* noop */ }
    },
  };
}

export default defineConfig({
  base: '/HCMN/',
  plugins: [react(), spa404Plugin()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
