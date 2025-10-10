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
  })
})
