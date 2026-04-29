import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api/pennylane': {
        target: process.env.BACKEND_API_URL || 'http://localhost:8787',
        changeOrigin: true
      }
    }
  }
});
