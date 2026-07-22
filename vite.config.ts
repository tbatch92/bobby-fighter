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
        // The labs ship alongside the game: the clearest illustration of what
        // "the characters and stages are drawn in code" actually means. The cat
        // lab shows every fighter in every pose; the stage lab shows every
        // location panning across its full width.
        lab: 'lab.html',
        stages: 'stages.html',
      },
    },
  },
}))
