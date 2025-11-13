import { vi } from 'vitest'

/**
 * Creates a mock config object that can be used with vi.mock() to override the config module.
 * This mock satisfies both convict's API requirements and downstream dependencies like pino.
 *
 * @example
 * ```javascript
 * import { createMockConfig } from '#vite/helpers/mock-config.js'
 *
 * vi.mock('../config.js', () => createMockConfig())
 * ```
 *
 * @example
 * ```javascript
 * // With custom config values
 * import { createMockConfig } from '#vite/helpers/mock-config.js'
 *
 * vi.mock('../config.js', () => createMockConfig({
 *   customKey: { customValue: 'test' }
 * }))
 * ```
 */
export const createMockConfig = (customConfigMap = {}) => {
  const defaultConfigMap = {
    awsRegion: 'eu-west-2',
    s3Endpoint: 'http://localhost:4566',
    isDevelopment: true,
    mongo: {
      mongoUrl: 'mongodb://localhost:27017',
      mongoOptions: { maxPoolSize: 10 },
      databaseName: 'test-db'
    },
    log: {
      isEnabled: false,
      level: 'silent',
      format: 'pino-pretty',
      redact: [] // Empty array satisfies pino validation
    },
    audit: {
      isEnabled: false
    }
  }

  const configMap = { ...defaultConfigMap, ...customConfigMap }

  const config = {
    get: vi.fn((key) => {
      return configMap[key] || {}
    }),
    validate: vi.fn(),
    has: vi.fn(() => true),
    getProperties: vi.fn(() => ({})),
    getSchema: vi.fn(() => ({})),
    getSchemaString: vi.fn(() => ''),
    toString: vi.fn(() => ''),
    set: vi.fn(),
    default: vi.fn(),
    load: vi.fn(),
    loadFile: vi.fn()
  }

  return {
    config,
    getConfig: vi.fn(() => config)
  }
}
