import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    clearMocks: true,
    hookTimeout: 60000,
    fileParallelism: !process.env.CI,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov'],
      include: ['src/**'],
      exclude: [
        ...configDefaults.exclude,
        '.vite/fixtures/**',
        '.vite/helpers/**',
        '**/*.json',
        '**/*.md',
        '**/*.port.js',
        '**/*.sh',
        '**/*.xlsx',
        '**/.DS_Store',
        '**/types.js',
        'coverage',
        'src/common/hapi-types.js',
        'src/common/helpers/secure-context.js',
        'src/config.js',
        'src/domain/**/model.js',
        'src/domain/**/port.js',
        'src/index.js',
        'src/repositories/**/port.js',
        'src/test/**'
      ],
      thresholds: {
        lines: 100,
        statements: 100,
        branches: 100,
        functions: 100
      }
    },
    setupFiles: ['.vite/setup-files.js']
  }
})
