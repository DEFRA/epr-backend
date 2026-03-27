import { describe, it, expect, vi } from 'vitest'
import { createConfigFeatureFlags } from './feature-flags.config.js'

describe('createConfigFeatureFlags', () => {
  it('returns true when formsDataMigration flag is enabled', () => {
    const config = { get: vi.fn().mockReturnValue(true) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isFormsDataMigrationEnabled()).toBe(true)
    expect(config.get).toHaveBeenCalledWith('featureFlags.formsDataMigration')
  })

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

  it('returns true when overseasSites flag is enabled', () => {
    const config = { get: vi.fn().mockReturnValue(true) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isOverseasSitesEnabled()).toBe(true)
    expect(config.get).toHaveBeenCalledWith('featureFlags.overseasSites')
  })

  it('returns false when overseasSites flag is disabled', () => {
    const config = { get: vi.fn().mockReturnValue(false) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isOverseasSitesEnabled()).toBe(false)
    expect(config.get).toHaveBeenCalledWith('featureFlags.overseasSites')
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

  it('should return true when registeredOnly flag is enabled', () => {
    const config = { get: vi.fn().mockReturnValue(true) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isRegisteredOnlyEnabled()).toBe(true)
    expect(config.get).toHaveBeenCalledWith('featureFlags.registeredOnly')
  })

  it('should return false when registeredOnly flag is disabled', () => {
    const config = { get: vi.fn().mockReturnValue(false) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isRegisteredOnlyEnabled()).toBe(false)
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
})
