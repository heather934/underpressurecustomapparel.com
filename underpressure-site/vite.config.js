import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // Inline assets under 100kb to avoid separate requests for small images
    assetsInlineLimit: 100000,
  },
})
