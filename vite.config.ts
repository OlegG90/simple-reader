import { defineConfig } from 'vite'

export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    // Mermaid's diagram chunks (elk, katex, ...) are lazy-loaded on demand via
    // dynamic import(), so chunks over the default 500 kB limit are expected.
    chunkSizeWarningLimit: 1600,
  },
})
