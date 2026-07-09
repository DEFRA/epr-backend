import { describe, it, expect } from 'vitest'
import { createInMemoryFeatureFlags } from './feature-flags.inmemory.js'

describe('createInMemoryFeatureFlags', () => {
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

  it('returns true when fixDuplicateAccreditationLinks flag is enabled', () => {
    const flags = createInMemoryFeatureFlags({
      fixDuplicateAccreditationLinks: true
    })
    expect(flags.isFixDuplicateAccreditationLinksEnabled()).toBe(true)
  })

  it('returns false when fixDuplicateAccreditationLinks flag is disabled', () => {
    const flags = createInMemoryFeatureFlags({
      fixDuplicateAccreditationLinks: false
    })
    expect(flags.isFixDuplicateAccreditationLinksEnabled()).toBe(false)
  })

  it('returns false when fixDuplicateAccreditationLinks flag is not provided', () => {
    const flags = createInMemoryFeatureFlags({})
    expect(flags.isFixDuplicateAccreditationLinksEnabled()).toBe(false)
  })

  it('returns true when summaryLogRowStates flag is enabled', () => {
    const flags = createInMemoryFeatureFlags({ summaryLogRowStates: true })
    expect(flags.isSummaryLogRowStatesEnabled()).toBe(true)
  })

  it('returns false when summaryLogRowStates flag is disabled', () => {
    const flags = createInMemoryFeatureFlags({ summaryLogRowStates: false })
    expect(flags.isSummaryLogRowStatesEnabled()).toBe(false)
  })

  it('returns false when summaryLogRowStates flag is not provided', () => {
    const flags = createInMemoryFeatureFlags({})
    expect(flags.isSummaryLogRowStatesEnabled()).toBe(false)
  })

  it('returns true when summaryLogRowStatesBackfill flag is enabled', () => {
    const flags = createInMemoryFeatureFlags({
      summaryLogRowStatesBackfill: true
    })
    expect(flags.isSummaryLogRowStatesBackfillEnabled()).toBe(true)
  })

  it('returns false when summaryLogRowStatesBackfill flag is disabled', () => {
    const flags = createInMemoryFeatureFlags({
      summaryLogRowStatesBackfill: false
    })
    expect(flags.isSummaryLogRowStatesBackfillEnabled()).toBe(false)
  })

  it('returns false when summaryLogRowStatesBackfill flag is not provided', () => {
    const flags = createInMemoryFeatureFlags({})
    expect(flags.isSummaryLogRowStatesBackfillEnabled()).toBe(false)
  })

  it('returns true when registeredOnlySubmittedEvents flag is enabled', () => {
    const flags = createInMemoryFeatureFlags({
      registeredOnlySubmittedEvents: true
    })
    expect(flags.isRegisteredOnlySubmittedEventsEnabled()).toBe(true)
  })

  it('returns false when registeredOnlySubmittedEvents flag is disabled', () => {
    const flags = createInMemoryFeatureFlags({
      registeredOnlySubmittedEvents: false
    })
    expect(flags.isRegisteredOnlySubmittedEventsEnabled()).toBe(false)
  })

  it('returns false when registeredOnlySubmittedEvents flag is not provided', () => {
    const flags = createInMemoryFeatureFlags({})
    expect(flags.isRegisteredOnlySubmittedEventsEnabled()).toBe(false)
  })

  it('returns true when summaryLogRowStatesDiscrepancyReport flag is enabled', () => {
    const flags = createInMemoryFeatureFlags({
      summaryLogRowStatesDiscrepancyReport: true
    })
    expect(flags.isSummaryLogRowStatesDiscrepancyReportEnabled()).toBe(true)
  })

  it('returns false when summaryLogRowStatesDiscrepancyReport flag is disabled', () => {
    const flags = createInMemoryFeatureFlags({
      summaryLogRowStatesDiscrepancyReport: false
    })
    expect(flags.isSummaryLogRowStatesDiscrepancyReportEnabled()).toBe(false)
  })

  it('returns false when summaryLogRowStatesDiscrepancyReport flag is not provided', () => {
    const flags = createInMemoryFeatureFlags({})
    expect(flags.isSummaryLogRowStatesDiscrepancyReportEnabled()).toBe(false)
  })

  it('returns true when staleIssuedTonnageReport flag is enabled', () => {
    const flags = createInMemoryFeatureFlags({
      staleIssuedTonnageReport: true
    })
    expect(flags.isStaleIssuedTonnageReportEnabled()).toBe(true)
  })

  it('returns false when staleIssuedTonnageReport flag is disabled', () => {
    const flags = createInMemoryFeatureFlags({
      staleIssuedTonnageReport: false
    })
    expect(flags.isStaleIssuedTonnageReportEnabled()).toBe(false)
  })

  it('returns false when staleIssuedTonnageReport flag is not provided', () => {
    const flags = createInMemoryFeatureFlags({})
    expect(flags.isStaleIssuedTonnageReportEnabled()).toBe(false)
  })
})
