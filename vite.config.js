import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), output: resolve(__dirname, 'output.html') } },
  },
  server: { port: 5183, strictPort: true },
});
