import { afterEach, describe, expect, it } from 'vitest'

import {
  config,
  getConfig,
  isLocalEnvironment,
  isProductionEnvironment
} from '#root/config.js'

describe('config', () => {
  describe('cdpUploader.callbackHmacKey', () => {
    it('should refuse to validate without a key', () => {
      const cfg = getConfig()
      cfg.set('cdpUploader.callbackHmacKey', null)

      expect(() => cfg.validate({ allowed: 'strict' })).toThrow(
        'cdpUploader.callbackHmacKey: must be 64 lowercase hex characters'
      )
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
