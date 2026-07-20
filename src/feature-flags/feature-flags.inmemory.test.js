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

  it('returns true when preCpaResubmissionReport flag is enabled', () => {
    const flags = createInMemoryFeatureFlags({
      preCpaResubmissionReport: true
    })
    expect(flags.isPreCpaResubmissionReportEnabled()).toBe(true)
  })

  it('returns false when preCpaResubmissionReport flag is disabled', () => {
    const flags = createInMemoryFeatureFlags({
      preCpaResubmissionReport: false
    })
    expect(flags.isPreCpaResubmissionReportEnabled()).toBe(false)
  })

  it('returns false when preCpaResubmissionReport flag is not provided', () => {
    const flags = createInMemoryFeatureFlags({})
    expect(flags.isPreCpaResubmissionReportEnabled()).toBe(false)
  })
})
