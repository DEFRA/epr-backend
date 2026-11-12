import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  config,
  getConfig,
  isLocalEnvironment,
  isProductionEnvironment
} from '#root/config.js'

const NEXT_YEAR_IN_PROD_ERROR =
  'OPEN_NEXT_YEAR must not be true when ENVIRONMENT is prod'

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

  describe('opening next year', () => {
    const loadConfig = ({ environment, openNextYear }) => {
      vi.stubEnv('ENVIRONMENT', environment)
      vi.stubEnv('OPEN_NEXT_YEAR', openNextYear)
      vi.resetModules()
      return import('#root/config.js')
    }

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('should refuse to load in prod with next year open', async () => {
      await expect(
        loadConfig({ environment: 'prod', openNextYear: 'true' })
      ).rejects.toThrow(NEXT_YEAR_IN_PROD_ERROR)
    })

    it('should load in prod with next year closed', async () => {
      const loaded = await loadConfig({
        environment: 'prod',
        openNextYear: 'false'
      })

      expect(loaded.config.get('openNextYear')).toBe(false)
    })

    it('should load outside prod with next year open', async () => {
      const loaded = await loadConfig({
        environment: 'dev',
        openNextYear: 'true'
      })

      expect(loaded.config.get('openNextYear')).toBe(true)
    })

    it('should refuse to build a prod config with next year open', () => {
      expect(() =>
        getConfig({ cdpEnvironment: 'prod', openNextYear: true })
      ).toThrow(NEXT_YEAR_IN_PROD_ERROR)
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
