import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/widget.jsx'),
      name: 'UPPreviewers',
      fileName: 'up-previewers',
      formats: ['iife'], // single self-executing file, no module system needed
    },
    outDir: 'dist-widget',
    // Inline ALL assets — images base64 encoded into the bundle
    assetsInlineLimit: 10000000,
    rollupOptions: {
      output: {
        // No external deps — bundle React too so index.html needs zero setup
        inlineDynamicImports: true,
      },
    },
  },
})
