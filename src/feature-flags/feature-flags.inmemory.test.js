import { describe, it, expect } from 'vitest'
import { createInMemoryFeatureFlags } from './feature-flags.inmemory.js'

describe('createInMemoryFeatureFlags', () => {
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

  it('returns true when wasteRecordStates flag is enabled', () => {
    const flags = createInMemoryFeatureFlags({ wasteRecordStates: true })
    expect(flags.isWasteRecordStatesEnabled()).toBe(true)
  })

  it('returns false when wasteRecordStates flag is disabled', () => {
    const flags = createInMemoryFeatureFlags({ wasteRecordStates: false })
    expect(flags.isWasteRecordStatesEnabled()).toBe(false)
  })

  it('returns false when wasteRecordStates flag is not provided', () => {
    const flags = createInMemoryFeatureFlags({})
    expect(flags.isWasteRecordStatesEnabled()).toBe(false)
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
})
