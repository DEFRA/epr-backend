import { afterEach, describe, expect, it } from 'vitest'

import {
  config,
  getConfig,
  isLocalEnvironment,
  isProductionEnvironment,
  validateConfig
} from '#root/config.js'

describe('config', () => {
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

describe('#validateConfig', () => {
  it('opens only the current year by default', () => {
    expect(config.get('latestOpenYear')).toBe('current')
  })

  it.each(['local', 'dev', 'test', 'perf-test', 'ext-test'])(
    'lets %s open the next year',
    (cdpEnvironment) => {
      const cfg = getConfig({ cdpEnvironment, latestOpenYear: 'next' })

      expect(() => validateConfig(cfg)).not.toThrow()
    }
  )

  it('refuses to open the next year in prod', () => {
    const cfg = getConfig({ cdpEnvironment: 'prod', latestOpenYear: 'next' })

    expect(() => validateConfig(cfg)).toThrow(
      'latestOpenYear must be "current" in prod'
    )
  })
})
