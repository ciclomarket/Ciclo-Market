import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  root: __dirname,
  base: '/admin/',
  define: {
    // Ensure admin build uses its own Supabase auth storage key
    'import.meta.env.VITE_APP_SCOPE': JSON.stringify('admin'),
  },
  plugins: [react()],
  publicDir: resolve(__dirname, '../public'),
  resolve: {
    alias: {
      '@admin': resolve(__dirname, 'src'),
      '@app': resolve(__dirname, '../src'),
    },
  },
  server: {
    port: 5273,
    fs: {
      allow: [resolve(__dirname), resolve(__dirname, '..')],
    },
  },
  build: {
    // Build is served by the backend under `/admin`
    outDir: resolve(__dirname, '../dist-admin'),
    emptyOutDir: true,
    sourcemap: true,
  },
})
