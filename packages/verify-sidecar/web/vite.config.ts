import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    proxy: {
      '/verify/api': {
        target: 'http://localhost:4001',
        rewrite: (path) => path.replace(/^\/verify/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
