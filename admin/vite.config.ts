import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  root: __dirname,
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
    // Emit admin build inside the main web dist so static hosting can serve /admin
    outDir: resolve(__dirname, '../dist/admin'),
    emptyOutDir: true,
    sourcemap: true,
  },
})
