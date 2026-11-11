import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  config,
  isLocalEnvironment,
  isProductionEnvironment
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

  describe('deprecated entra oidc env var', () => {
    const entraUrlPath = 'oidc.entraId.oidcWellKnownConfigurationUrl'

    afterEach(() => {
      vi.unstubAllEnvs()
      vi.resetModules()
    })

    it.for([
      {
        description: 'the replacement name',
        env: { ENTRA_OIDC_WELL_KNOWN_URL: 'https://new.example/' },
        expected: 'https://new.example/'
      },
      {
        description: 'the deprecated name when it is the only one set',
        env: {
          ENTRA_OIDC_WELL_KNOWN_CONFIGURATION_URL: 'https://old.example/'
        },
        expected: 'https://old.example/'
      },
      {
        description: 'the replacement name when both are set',
        env: {
          ENTRA_OIDC_WELL_KNOWN_URL: 'https://new.example/',
          ENTRA_OIDC_WELL_KNOWN_CONFIGURATION_URL: 'https://old.example/'
        },
        expected: 'https://new.example/'
      }
    ])('should read $description', async ({ env, expected }) => {
      vi.stubEnv('ENTRA_OIDC_WELL_KNOWN_URL', undefined)
      vi.stubEnv('ENTRA_OIDC_WELL_KNOWN_CONFIGURATION_URL', undefined)
      Object.entries(env).forEach(([name, value]) => vi.stubEnv(name, value))
      vi.resetModules()

      const { config: reloaded } = await import('#root/config.js')

      expect(reloaded.get(entraUrlPath)).toBe(expected)
    })
  })
})
