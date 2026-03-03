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

  describe('isPackagingRecyclingNotesExternalApiEnabled', () => {
    it('returns true when packagingRecyclingNotesExternalApi flag is enabled', () => {
      const flags = createInMemoryFeatureFlags({
        packagingRecyclingNotesExternalApi: true
      })
      expect(flags.isPackagingRecyclingNotesExternalApiEnabled()).toBe(true)
    })

    it('returns false when packagingRecyclingNotesExternalApi flag is disabled', () => {
      const flags = createInMemoryFeatureFlags({
        packagingRecyclingNotesExternalApi: false
      })
      expect(flags.isPackagingRecyclingNotesExternalApiEnabled()).toBe(false)
    })

    it('returns false when packagingRecyclingNotesExternalApi flag is not provided', () => {
      const flags = createInMemoryFeatureFlags({})
      expect(flags.isPackagingRecyclingNotesExternalApiEnabled()).toBe(false)
    })
  })

  describe('isCreatePackagingRecyclingNotesEnabled', () => {
    it('returns true when packagingRecyclingNotes flag is enabled', () => {
      const flags = createInMemoryFeatureFlags({
        packagingRecyclingNotes: true
      })
      expect(flags.isCreatePackagingRecyclingNotesEnabled()).toBe(true)
    })

    it('returns false when packagingRecyclingNotes flag is disabled', () => {
      const flags = createInMemoryFeatureFlags({
        packagingRecyclingNotes: false
      })
      expect(flags.isCreatePackagingRecyclingNotesEnabled()).toBe(false)
    })

    it('returns false when packagingRecyclingNotes flag is not provided', () => {
      const flags = createInMemoryFeatureFlags({})
      expect(flags.isCreatePackagingRecyclingNotesEnabled()).toBe(false)
    })
  })
})
