import { describe, it, expect } from 'vitest'
import { createInMemoryFeatureFlags } from './feature-flags.inmemory.js'

describe('createInMemoryFeatureFlags', () => {
  it('returns true when formsDataMigration flag is enabled', () => {
    const flags = createInMemoryFeatureFlags({
      formsDataMigration: true
    })
    expect(flags.isFormsDataMigrationEnabled()).toBe(true)
  })

  it('returns false when formsDataMigration flag is disabled', () => {
    const flags = createInMemoryFeatureFlags({ formsDataMigration: false })
    expect(flags.isFormsDataMigrationEnabled()).toBe(false)
  })

  it('returns false when formsDataMigration flag is not provided', () => {
    const flags = createInMemoryFeatureFlags({})
    expect(flags.isFormsDataMigrationEnabled()).toBe(false)
  })

  it('returns true when copyFormFilesToS3 flag is enabled', () => {
    const flags = createInMemoryFeatureFlags({ copyFormFilesToS3: true })
    expect(flags.isCopyFormFilesToS3Enabled()).toBe(true)
  })

  it('returns false when copyFormFilesToS3 flag is disabled', () => {
    const flags = createInMemoryFeatureFlags({ copyFormFilesToS3: false })
    expect(flags.isCopyFormFilesToS3Enabled()).toBe(false)
  })

  it('returns false when copyFormFilesToS3 flag is not provided', () => {
    const flags = createInMemoryFeatureFlags({})
    expect(flags.isCopyFormFilesToS3Enabled()).toBe(false)
  })

  it('returns true when devEndpoints flag is enabled', () => {
    const flags = createInMemoryFeatureFlags({ devEndpoints: true })
    expect(flags.isDevEndpointsEnabled()).toBe(true)
  })

  it('returns false when devEndpoints flag is disabled', () => {
    const flags = createInMemoryFeatureFlags({ devEndpoints: false })
    expect(flags.isDevEndpointsEnabled()).toBe(false)
  })

  it('returns false when devEndpoints flag is not provided', () => {
    const flags = createInMemoryFeatureFlags({})
    expect(flags.isDevEndpointsEnabled()).toBe(false)
  })

  describe('isOverseasSitesEnabled', () => {
    it('returns true when overseasSites flag is enabled', () => {
      const flags = createInMemoryFeatureFlags({
        overseasSites: true
      })
      expect(flags.isOverseasSitesEnabled()).toBe(true)
    })

    it('returns false when overseasSites flag is disabled', () => {
      const flags = createInMemoryFeatureFlags({
        overseasSites: false
      })
      expect(flags.isOverseasSitesEnabled()).toBe(false)
    })

    it('returns false when overseasSites flag is not provided', () => {
      const flags = createInMemoryFeatureFlags({})
      expect(flags.isOverseasSitesEnabled()).toBe(false)
    })
  })

  it('returns true when reports flag is enabled', () => {
    const flags = createInMemoryFeatureFlags({ reports: true })
    expect(flags.isReportsEnabled()).toBe(true)
  })

  it('returns false when reports flag is disabled', () => {
    const flags = createInMemoryFeatureFlags({ reports: false })
    expect(flags.isReportsEnabled()).toBe(false)
  })

  it('returns false when reports flag is not provided', () => {
    const flags = createInMemoryFeatureFlags({})
    expect(flags.isReportsEnabled()).toBe(false)
  })

  it('returns true when registeredOnly flag is enabled', () => {
    const flags = createInMemoryFeatureFlags({ registeredOnly: true })
    expect(flags.isRegisteredOnlyEnabled()).toBe(true)
  })

  it('returns false when registeredOnly flag is disabled', () => {
    const flags = createInMemoryFeatureFlags({ registeredOnly: false })
    expect(flags.isRegisteredOnlyEnabled()).toBe(false)
  })

  it('returns false when registeredOnly flag is not provided', () => {
    const flags = createInMemoryFeatureFlags({})
    expect(flags.isRegisteredOnlyEnabled()).toBe(false)
  })

  it('returns true when orsWasteBalanceValidation flag is enabled', () => {
    const flags = createInMemoryFeatureFlags({
      orsWasteBalanceValidation: true
    })
    expect(flags.isOrsWasteBalanceValidationEnabled()).toBe(true)
  })

  it('returns false when orsWasteBalanceValidation flag is disabled', () => {
    const flags = createInMemoryFeatureFlags({
      orsWasteBalanceValidation: false
    })
    expect(flags.isOrsWasteBalanceValidationEnabled()).toBe(false)
  })

  it('returns false when orsWasteBalanceValidation flag is not provided', () => {
    const flags = createInMemoryFeatureFlags({})
    expect(flags.isOrsWasteBalanceValidationEnabled()).toBe(false)
  })
})
