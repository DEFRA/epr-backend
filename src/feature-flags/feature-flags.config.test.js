import { describe, it, expect, vi } from 'vitest'
import { createConfigFeatureFlags } from './feature-flags.config.js'

describe('createConfigFeatureFlags', () => {
  it('returns true when devEndpoints flag is enabled', () => {
    const config = { get: vi.fn().mockReturnValue(true) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isDevEndpointsEnabled()).toBe(true)
    expect(config.get).toHaveBeenCalledWith('featureFlags.devEndpoints')
  })

  it('returns true when summaryLogRowStates flag is enabled', () => {
    const config = { get: vi.fn().mockReturnValue(true) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isSummaryLogRowStatesEnabled()).toBe(true)
    expect(config.get).toHaveBeenCalledWith('featureFlags.summaryLogRowStates')
  })

  it('returns true when staleIssuedTonnageReport flag is enabled', () => {
    const config = { get: vi.fn().mockReturnValue(true) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isStaleIssuedTonnageReportEnabled()).toBe(true)
    expect(config.get).toHaveBeenCalledWith(
      'featureFlags.staleIssuedTonnageReport'
    )
  })
})
