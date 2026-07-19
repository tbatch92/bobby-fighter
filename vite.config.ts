import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  // GitHub Pages serves the site from /bobby-fighter/, but the dev server serves
  // from the root — so the base path only applies to production builds.
  base: command === 'build' ? '/bobby-fighter/' : '/',
  server: { port: 5173, host: '127.0.0.1' },
  build: {
    target: 'es2022',
    rollupOptions: {
      // Paths are resolved relative to the project root, which keeps this config
      // free of any Node imports and therefore of @types/node.
      input: {
        main: 'index.html',
        // The cat lab ships alongside the game: it's the clearest illustration of
        // what "the characters are drawn in code" actually means.
        lab: 'lab.html',
      },
    },
  },
}))
