import { describe, it, expect, vi } from 'vitest'
import { createConfigFeatureFlags } from './feature-flags.config.js'

describe('createConfigFeatureFlags', () => {
  it('returns true when devEndpoints flag is enabled', () => {
    const config = { get: vi.fn().mockReturnValue(true) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isDevEndpointsEnabled()).toBe(true)
    expect(config.get).toHaveBeenCalledWith('featureFlags.devEndpoints')
  })

  it('returns true when copyFormFilesToS3 flag is enabled', () => {
    const config = { get: vi.fn().mockReturnValue(true) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isCopyFormFilesToS3Enabled()).toBe(true)
    expect(config.get).toHaveBeenCalledWith('featureFlags.copyFormFilesToS3')
  })

  it('returns false when copyFormFilesToS3 flag is disabled', () => {
    const config = { get: vi.fn().mockReturnValue(false) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isCopyFormFilesToS3Enabled()).toBe(false)
    expect(config.get).toHaveBeenCalledWith('featureFlags.copyFormFilesToS3')
  })

  it('returns true when summaryLogRowStates flag is enabled', () => {
    const config = { get: vi.fn().mockReturnValue(true) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isSummaryLogRowStatesEnabled()).toBe(true)
    expect(config.get).toHaveBeenCalledWith('featureFlags.summaryLogRowStates')
  })

  it('returns true when summaryLogRowStatesBackfill flag is enabled', () => {
    const config = { get: vi.fn().mockReturnValue(true) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isSummaryLogRowStatesBackfillEnabled()).toBe(true)
    expect(config.get).toHaveBeenCalledWith(
      'featureFlags.summaryLogRowStatesBackfill'
    )
  })

  it('returns true when registeredOnlySubmittedEvents flag is enabled', () => {
    const config = { get: vi.fn().mockReturnValue(true) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isRegisteredOnlySubmittedEventsEnabled()).toBe(true)
    expect(config.get).toHaveBeenCalledWith(
      'featureFlags.registeredOnlySubmittedEvents'
    )
  })

  it('returns true when summaryLogRowStatesDiscrepancyReport flag is enabled', () => {
    const config = { get: vi.fn().mockReturnValue(true) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isSummaryLogRowStatesDiscrepancyReportEnabled()).toBe(true)
    expect(config.get).toHaveBeenCalledWith(
      'featureFlags.summaryLogRowStatesDiscrepancyReport'
    )
  })
})
