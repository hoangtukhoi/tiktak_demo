import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const BACKEND = process.env.BACKEND_URL || 'http://localhost:5000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    // backend .env: FRONTEND_URL=http://localhost:3000 (CORS + Socket.IO)
    port: 3000,
    proxy: {
      '/api': BACKEND,
      '/socket.io': { target: BACKEND, ws: true },
    },
  },
});
