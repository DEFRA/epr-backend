import { describe, it, expect } from 'vitest'
import { validateStatusHistory } from './validation.js'
import { STATUS } from '#domain/organisations.js'

describe('validateStatusHistory', () => {
  it('throws badImplementation when statusHistory item has invalid status', () => {
    const statusHistory = [{ status: 'invalid-status', updatedAt: new Date() }]

    expect(() => validateStatusHistory(statusHistory)).toThrow(
      /Invalid statusHistory.*This is a system error/
    )
  })

  it('throws badImplementation when statusHistory item missing updatedAt', () => {
    const statusHistory = [{ status: STATUS.CREATED }]

    expect(() => validateStatusHistory(statusHistory)).toThrow(
      /Invalid statusHistory.*updatedAt.*required.*This is a system error/
    )
  })

  it('validates statusHistory with optional updatedBy field', () => {
    const statusHistory = [
      {
        status: STATUS.CREATED,
        updatedAt: new Date(),
        updatedBy: '507f1f77bcf86cd799439011'
      }
    ]

    const result = validateStatusHistory(statusHistory)

    expect(result).toEqual(statusHistory)
  })
})
