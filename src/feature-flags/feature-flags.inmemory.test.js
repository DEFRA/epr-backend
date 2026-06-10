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
})
