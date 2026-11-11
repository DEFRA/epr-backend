import { afterEach, describe, expect, it } from 'vitest'

import {
  assertNextYearClosedInProd,
  config,
  isLocalEnvironment,
  isProductionEnvironment
} from '#root/config.js'

describe('config', () => {
  describe('#assertNextYearClosedInProd', () => {
    it('should refuse to open next year in prod', () => {
      expect(() =>
        assertNextYearClosedInProd({
          cdpEnvironment: 'prod',
          openNextYear: true
        })
      ).toThrow('openNextYear must not be set in prod')
    })

    it('should let prod keep next year closed', () => {
      expect(() =>
        assertNextYearClosedInProd({
          cdpEnvironment: 'prod',
          openNextYear: false
        })
      ).not.toThrow()
    })

    it.each(['local', 'dev', 'test', 'perf-test', 'ext-test'])(
      'should let %s open next year',
      (cdpEnvironment) => {
        expect(() =>
          assertNextYearClosedInProd({ cdpEnvironment, openNextYear: true })
        ).not.toThrow()
      }
    )
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
