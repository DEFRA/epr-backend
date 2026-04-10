import { describe, expect, it } from 'vitest'

import { isOrsApprovedAtDate } from './approval.js'

describe('#isOrsApprovedAtDate', () => {
  it('returns true when validFrom is on the date of export', () => {
    const validFrom = new Date('2026-01-20')
    expect(isOrsApprovedAtDate(validFrom, '2026-01-20')).toBe(true)
  })

  it('returns true when validFrom is before the date of export', () => {
    const validFrom = new Date('2025-06-01')
    expect(isOrsApprovedAtDate(validFrom, '2026-01-20')).toBe(true)
  })

  it('returns false when validFrom is after the date of export', () => {
    const validFrom = new Date('2026-02-01')
    expect(isOrsApprovedAtDate(validFrom, '2026-01-20')).toBe(false)
  })

  it('returns false when validFrom is null', () => {
    expect(isOrsApprovedAtDate(null, '2026-01-20')).toBe(false)
  })

  it('returns false when validFrom is undefined', () => {
    expect(isOrsApprovedAtDate(undefined, '2026-01-20')).toBe(false)
  })
})
