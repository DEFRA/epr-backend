import { describe, expect, it } from 'vitest'
import { validateRegistration, validateStatusHistory } from './validation.js'
import { STATUS } from '#domain/organisations/model.js'

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

describe('validateRegistration', () => {
  it('throws badData when required fields are missing', () => {
    const invalidRegistration = {
      id: 'invalid-id',
      // Missing required fields: formSubmissionTime, submittedToRegulator, material, wasteProcessingType
      orgName: 'Test Org'
    }

    expect(() => validateRegistration(invalidRegistration)).toThrow(
      /Invalid registration data/
    )
  })
})
