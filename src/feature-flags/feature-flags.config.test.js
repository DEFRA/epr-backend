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

  it('returns true when reports flag is enabled', () => {
    const config = { get: vi.fn().mockReturnValue(true) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isReportsEnabled()).toBe(true)
    expect(config.get).toHaveBeenCalledWith('featureFlags.reports')
  })

  it('returns false when reports flag is disabled', () => {
    const config = { get: vi.fn().mockReturnValue(false) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isReportsEnabled()).toBe(false)
    expect(config.get).toHaveBeenCalledWith('featureFlags.reports')
  })

  it('returns true when orsWasteBalanceValidation flag is enabled', () => {
    const config = { get: vi.fn().mockReturnValue(true) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isOrsWasteBalanceValidationEnabled()).toBe(true)
    expect(config.get).toHaveBeenCalledWith(
      'featureFlags.orsWasteBalanceValidation'
    )
  })

  it('returns false when orsWasteBalanceValidation flag is disabled', () => {
    const config = { get: vi.fn().mockReturnValue(false) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isOrsWasteBalanceValidationEnabled()).toBe(false)
  })

  it('returns true when wasteBalanceLedger flag is enabled', () => {
    const config = { get: vi.fn().mockReturnValue(true) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isWasteBalanceLedgerEnabled()).toBe(true)
    expect(config.get).toHaveBeenCalledWith('featureFlags.wasteBalanceLedger')
  })

  it('returns false when wasteBalanceLedger flag is disabled', () => {
    const config = { get: vi.fn().mockReturnValue(false) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isWasteBalanceLedgerEnabled()).toBe(false)
  })

  it('returns true when migrateFormSubmissionLineage flag is enabled', () => {
    const config = { get: vi.fn().mockReturnValue(true) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isMigrateFormSubmissionLineageEnabled()).toBe(true)
    expect(config.get).toHaveBeenCalledWith(
      'featureFlags.migrateFormSubmissionLineage'
    )
  })

  it('returns false when migrateFormSubmissionLineage flag is disabled', () => {
    const config = { get: vi.fn().mockReturnValue(false) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isMigrateFormSubmissionLineageEnabled()).toBe(false)
  })
})
