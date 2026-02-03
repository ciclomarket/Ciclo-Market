
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy de desarrollo: evita CORS hacia Render
      '/api': {
        target: process.env.VITE_PROXY_API_TARGET || 'https://ciclo-market.onrender.com',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
})
