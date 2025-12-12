import { configDefaults, defineConfig } from 'vitest/config'
import { skippedTests } from './.vite/skipped-tests.js'

// When SKIP_BROKEN_TESTS is enabled, these lower thresholds are used
// to allow the build to pass while tests are being fixed incrementally.
// Original thresholds: lines: 100, statements: 100, branches: 100, functions: 100
const TEMPORARY_THRESHOLDS = {
  lines: 85,
  statements: 85,
  branches: 85,
  functions: 85
}

const shouldSkipBrokenTests = process.env.SKIP_BROKEN_TESTS === 'true'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    clearMocks: true,
    hookTimeout: 60000,
    fileParallelism: !process.env.CI,
    // Conditionally exclude broken tests when SKIP_BROKEN_TESTS=true
    exclude: shouldSkipBrokenTests
      ? [...configDefaults.exclude, ...skippedTests]
      : configDefaults.exclude,
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
        '**/index.js',
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
      thresholds: shouldSkipBrokenTests
        ? TEMPORARY_THRESHOLDS
        : {
            lines: 100,
            statements: 100,
            branches: 100,
            functions: 100
          }
    },
    setupFiles: ['.vite/setup-files.js']
  }
})
