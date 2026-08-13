import { describe, it, expect } from 'vitest'
import { createInMemoryFeatureFlags } from './feature-flags.inmemory.js'

/**
 * @type {Array<[
 *   keyof import('./feature-flags.port.js').FeatureFlags,
 *   keyof import('./feature-flags.port.js').FeatureFlagOverrides
 * ]>}
 */
const FLAGS = [
  ['isDevEndpointsEnabled', 'devEndpoints'],
  ['isPreCpaResubmissionBackfillEnabled', 'preCpaResubmissionBackfill'],
  ['isPreCpaResubmissionReportEnabled', 'preCpaResubmissionReport'],
  ['isStaleIssuedTonnageReportEnabled', 'staleIssuedTonnageReport']
]

describe('createInMemoryFeatureFlags', () => {
  it.each(FLAGS)('%s returns true when %s is enabled', (method, flag) => {
    const flags = createInMemoryFeatureFlags({ [flag]: true })

    expect(flags[method]()).toBe(true)
  })

  it.each(FLAGS)('%s returns false when %s is disabled', (method, flag) => {
    const flags = createInMemoryFeatureFlags({ [flag]: false })

    expect(flags[method]()).toBe(false)
  })

  it.each(FLAGS)('%s returns false when %s is not provided', (method) => {
    const flags = createInMemoryFeatureFlags({})

    expect(flags[method]()).toBe(false)
  })
})
