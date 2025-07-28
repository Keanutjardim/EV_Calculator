import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    proxy: {
      '/calculate': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/scrape-vehicle': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
    open: true
  },
});