import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 3000,
    proxy: {
      // Proxy sang backend để dev không vướng CORS; /socket.io cần ws: true.
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:5000', ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Tách thư viện lớn ra chunk riêng để lần tải đầu nhẹ hơn.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          player: ['hls.js'],
          motion: ['framer-motion'],
        },
      },
    },
  },
});
