import { defineConfig, configDefaults } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov'],
      include: ['src/**'],
      exclude: [
        ...configDefaults.exclude,
        'coverage',
        'src/index.js',
        'src/config.js',
        'src/**/example-*.js',
        'src/routes/example.js'
      ]
    },
    coverageThreshold: {
      global: {
        lines: 100,
        statements: 100,
        branches: 100,
        functions: 100
      }
    },
    pool: 'forks',
    setupFiles: ['.vite/mongo-memory-server.js', '.vite/setup-files.js']
  }
})
