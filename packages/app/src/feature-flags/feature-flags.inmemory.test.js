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
})
