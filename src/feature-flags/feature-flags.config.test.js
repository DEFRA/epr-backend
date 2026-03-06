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

  it('returns true when packagingRecyclingNotesExternalApi flag is enabled', () => {
    const config = { get: vi.fn().mockReturnValue(true) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isPackagingRecyclingNotesExternalApiEnabled()).toBe(true)
    expect(config.get).toHaveBeenCalledWith(
      'featureFlags.packagingRecyclingNotesExternalApi'
    )
  })

  it('returns false when packagingRecyclingNotesExternalApi flag is disabled', () => {
    const config = { get: vi.fn().mockReturnValue(false) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isPackagingRecyclingNotesExternalApiEnabled()).toBe(false)
    expect(config.get).toHaveBeenCalledWith(
      'featureFlags.packagingRecyclingNotesExternalApi'
    )
  })

  it('returns true when packagingRecyclingNotes flag is enabled', () => {
    const config = { get: vi.fn().mockReturnValue(true) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isCreatePackagingRecyclingNotesEnabled()).toBe(true)
    expect(config.get).toHaveBeenCalledWith(
      'featureFlags.packagingRecyclingNotes'
    )
  })

  it('returns false when packagingRecyclingNotes flag is disabled', () => {
    const config = { get: vi.fn().mockReturnValue(false) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isCreatePackagingRecyclingNotesEnabled()).toBe(false)
    expect(config.get).toHaveBeenCalledWith(
      'featureFlags.packagingRecyclingNotes'
    )
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
})
