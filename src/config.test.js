import { afterEach, beforeEach, describe, expect, it, test, vi } from 'vitest'

import {
  config,
  isLocalEnvironment,
  isProductionEnvironment
} from '#root/config.js'

describe('config', () => {
  describe('Log redact configuration', () => {
    beforeEach(() => {
      vi.resetModules()
    })

    test('Should set log redact paths for production environment', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      const configModule = await import('#root/config.js')

      const redactPaths = configModule.config.get('log.redact')

      expect(redactPaths).toEqual([
        'http.request.headers.authorization',
        'http.request.headers.cookie',
        'http.response.headers'
      ])
    })

    test('Should set log redact paths to empty array for non-production environments', async () => {
      vi.stubEnv('NODE_ENV', 'test')
      const configModule = await import('#root/config.js')

      const redactPaths = configModule.config.get('log.redact')

      expect(redactPaths).toEqual([])
    })
  })

  describe('#isProductionEnvironment', () => {
    afterEach(() => {
      config.reset('cdpEnvironment')
    })

    it('should return true when cdpEnvironment is prod', () => {
      config.set('cdpEnvironment', 'prod')

      expect(isProductionEnvironment()).toBe(true)
    })

    it.each([
      'local',
      'infra-dev',
      'management',
      'dev',
      'test',
      'perf-test',
      'ext-test'
    ])('should return false when cdpEnvironment is %s', (env) => {
      config.set('cdpEnvironment', env)

      expect(isProductionEnvironment()).toBe(false)
    })
  })

  describe('#isLocalEnvironment', () => {
    afterEach(() => {
      config.reset('cdpEnvironment')
    })

    it('should return true when cdpEnvironment is local', () => {
      config.set('cdpEnvironment', 'local')

      expect(isLocalEnvironment()).toBe(true)
    })

    it.each([
      'infra-dev',
      'management',
      'dev',
      'test',
      'perf-test',
      'ext-test',
      'prod'
    ])('should return false when cdpEnvironment is %s', (env) => {
      config.set('cdpEnvironment', env)

      expect(isLocalEnvironment()).toBe(false)
    })
  })
})
