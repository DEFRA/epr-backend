import { describe, it, expect, vi } from 'vitest'
import { createConfigFeatureFlags } from './feature-flags.config.js'

describe('createConfigFeatureFlags', () => {
  it('returns true when summaryLogs flag is enabled', () => {
    const config = { get: vi.fn().mockReturnValue(true) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isSummaryLogsEnabled()).toBe(true)
    expect(config.get).toHaveBeenCalledWith('featureFlags.summaryLogs')
  })

  it('returns false when summaryLogs flag is disabled', () => {
    const config = { get: vi.fn().mockReturnValue(false) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isSummaryLogsEnabled()).toBe(false)
    expect(config.get).toHaveBeenCalledWith('featureFlags.summaryLogs')
  })

  it('returns true when logFileUploadsFromForms flag is enabled', () => {
    const config = { get: vi.fn().mockReturnValue(true) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isLogFileUploadsFromFormsEnabled()).toBe(true)
    expect(config.get).toHaveBeenCalledWith('featureFlags.logFileUploadsFromForms')
  })

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

  it('returns true when calculateWasteBalanceOnImport flag is enabled', () => {
    const config = { get: vi.fn().mockReturnValue(true) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isCalculateWasteBalanceOnImportEnabled()).toBe(true)
    expect(config.get).toHaveBeenCalledWith('featureFlags.calculateWasteBalanceOnImport')
  })

  it('returns false when calculateWasteBalanceOnImport flag is disabled', () => {
    const config = { get: vi.fn().mockReturnValue(false) }
    const flags = createConfigFeatureFlags(config)
    expect(flags.isCalculateWasteBalanceOnImportEnabled()).toBe(false)
    expect(config.get).toHaveBeenCalledWith('featureFlags.calculateWasteBalanceOnImport')
  })
})
