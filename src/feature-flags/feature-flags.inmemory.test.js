import { describe, it, expect } from 'vitest'
import { createInMemoryFeatureFlags } from './feature-flags.inmemory.js'

describe('createInMemoryFeatureFlags', () => {
  it('returns true when summaryLogs flag is enabled', () => {
    const flags = createInMemoryFeatureFlags({ summaryLogs: true })
    expect(flags.isSummaryLogsEnabled()).toBe(true)
  })

  it('returns false when summaryLogs flag is disabled', () => {
    const flags = createInMemoryFeatureFlags({ summaryLogs: false })
    expect(flags.isSummaryLogsEnabled()).toBe(false)
  })

  it('returns false when summaryLogs flag is not provided', () => {
    const flags = createInMemoryFeatureFlags({})
    expect(flags.isSummaryLogsEnabled()).toBe(false)
  })

  it('returns false when no flags are provided', () => {
    const flags = createInMemoryFeatureFlags()
    expect(flags.isSummaryLogsEnabled()).toBe(false)
    expect(flags.isLogFileUploadsFromFormsEnabled()).toBe(false)
  })

  it('returns true when logFileUploadsFromForms flag is enabled', () => {
    const flags = createInMemoryFeatureFlags({ logFileUploadsFromForms: true })
    expect(flags.isLogFileUploadsFromFormsEnabled()).toBe(true)
  })

  it('returns false when logFileUploadsFromForms flag is disabled', () => {
    const flags = createInMemoryFeatureFlags({ logFileUploadsFromForms: false })
    expect(flags.isLogFileUploadsFromFormsEnabled()).toBe(false)
  })

  it('returns false when logFileUploadsFromForms flag is not provided', () => {
    const flags = createInMemoryFeatureFlags({})
    expect(flags.isLogFileUploadsFromFormsEnabled()).toBe(false)
  })

  it('returns true when formsDataMigration flag is enabled', () => {
    const flags = createInMemoryFeatureFlags({
      summaryLogs: true,
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

  it('returns true when calculateWasteBalanceOnImport flag is enabled', () => {
    const flags = createInMemoryFeatureFlags({
      calculateWasteBalanceOnImport: true
    })
    expect(flags.isCalculateWasteBalanceOnImportEnabled()).toBe(true)
  })

  it('returns false when calculateWasteBalanceOnImport flag is disabled', () => {
    const flags = createInMemoryFeatureFlags({
      calculateWasteBalanceOnImport: false
    })
    expect(flags.isCalculateWasteBalanceOnImportEnabled()).toBe(false)
  })

  it('returns false when calculateWasteBalanceOnImport flag is not provided', () => {
    const flags = createInMemoryFeatureFlags({})
    expect(flags.isCalculateWasteBalanceOnImportEnabled()).toBe(false)
  })

  describe('getGlassMigrationMode', () => {
    it('returns enabled when set to enabled', () => {
      const flags = createInMemoryFeatureFlags({ glassMigration: 'enabled' })
      expect(flags.getGlassMigrationMode()).toBe('enabled')
    })

    it('returns dry-run when set to dry-run', () => {
      const flags = createInMemoryFeatureFlags({ glassMigration: 'dry-run' })
      expect(flags.getGlassMigrationMode()).toBe('dry-run')
    })

    it('returns disabled when not provided', () => {
      const flags = createInMemoryFeatureFlags({})
      expect(flags.getGlassMigrationMode()).toBe('disabled')
    })
  })

  describe('isCreatePackagingRecyclingNotesEnabled', () => {
    it('returns true when createPackagingRecyclingNotes flag is enabled', () => {
      const flags = createInMemoryFeatureFlags({
        createPackagingRecyclingNotes: true
      })
      expect(flags.isCreatePackagingRecyclingNotesEnabled()).toBe(true)
    })

    it('returns false when createPackagingRecyclingNotes flag is disabled', () => {
      const flags = createInMemoryFeatureFlags({
        createPackagingRecyclingNotes: false
      })
      expect(flags.isCreatePackagingRecyclingNotesEnabled()).toBe(false)
    })

    it('returns false when createPackagingRecyclingNotes flag is not provided', () => {
      const flags = createInMemoryFeatureFlags({})
      expect(flags.isCreatePackagingRecyclingNotesEnabled()).toBe(false)
    })
  })
})
