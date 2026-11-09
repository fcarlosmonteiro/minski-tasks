import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// npm run dev na porta 5173; /api vai para o Flask local na porta 5000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:5000',
    },
  },
  build: {
    // Versões mínimas acordadas para o item (Chrome 111+, Safari 16.4+).
    target: ['chrome111', 'safari16.4'],
  },
  test: {
    environment: 'node',
  },
})
