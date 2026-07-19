import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  // GitHub Pages serves the site from /bobby-fighter/, but the dev server serves
  // from the root — so the base path only applies to production builds.
  base: command === 'build' ? '/bobby-fighter/' : '/',
  server: { port: 5173, host: '127.0.0.1' },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        // The cat lab ships alongside the game: it's the clearest illustration of
        // what "the characters are drawn in code" actually means.
        main: resolve(import.meta.dirname, 'index.html'),
        lab: resolve(import.meta.dirname, 'lab.html'),
      },
    },
  },
}))
