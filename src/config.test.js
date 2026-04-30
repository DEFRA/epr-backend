import { describe, expect, it, afterEach } from 'vitest'

import { config, isProductionEnvironment } from '#root/config.js'

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
