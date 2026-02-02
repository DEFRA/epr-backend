import { describe, expect, it } from 'vitest'
import { PRN_STATUS } from './status.js'

describe('PRN_STATUS', () => {
  it('exports all expected status values', () => {
    expect(PRN_STATUS).toEqual({
      DRAFT: 'draft',
      AWAITING_AUTHORISATION: 'awaiting_authorisation',
      AWAITING_ACCEPTANCE: 'awaiting_acceptance',
      ACCEPTED: 'accepted',
      REJECTED: 'rejected',
      CANCELLED: 'cancelled',
      AWAITING_CANCELLATION: 'awaiting_cancellation'
    })
  })

  it('is frozen and cannot be modified', () => {
    expect(Object.isFrozen(PRN_STATUS)).toBe(true)
  })

  it('has unique values', () => {
    const values = Object.values(PRN_STATUS)
    const uniqueValues = new Set(values)

    expect(uniqueValues.size).toBe(values.length)
  })
})
