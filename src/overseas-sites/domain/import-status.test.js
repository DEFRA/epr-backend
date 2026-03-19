import { describe, it, expect, vi, afterEach } from 'vitest'

import {
  ORS_IMPORT_STATUS,
  calculateOrsImportExpiresAt
} from './import-status.js'

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24

describe('calculateOrsImportExpiresAt', () => {
  const NOW = new Date('2026-01-15T12:00:00.000Z')

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns a date 1 day in the future for PREPROCESSING status', () => {
    vi.setSystemTime(NOW)

    const result = calculateOrsImportExpiresAt(ORS_IMPORT_STATUS.PREPROCESSING)

    expect(result).toEqual(new Date(NOW.getTime() + MILLISECONDS_PER_DAY))
  })

  it('returns a date 1 day in the future for PROCESSING status', () => {
    vi.setSystemTime(NOW)

    const result = calculateOrsImportExpiresAt(ORS_IMPORT_STATUS.PROCESSING)

    expect(result).toEqual(new Date(NOW.getTime() + MILLISECONDS_PER_DAY))
  })

  it('returns a date 1 day in the future for FAILED status', () => {
    vi.setSystemTime(NOW)

    const result = calculateOrsImportExpiresAt(ORS_IMPORT_STATUS.FAILED)

    expect(result).toEqual(new Date(NOW.getTime() + MILLISECONDS_PER_DAY))
  })

  it('returns null for COMPLETED status', () => {
    const result = calculateOrsImportExpiresAt(ORS_IMPORT_STATUS.COMPLETED)

    expect(result).toBeNull()
  })

  it('throws for unknown status', () => {
    expect(() => calculateOrsImportExpiresAt('banana')).toThrow(
      'Unknown ORS import status for TTL calculation: banana'
    )
  })
})
