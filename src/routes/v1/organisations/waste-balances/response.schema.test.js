import { describe, it, expect } from 'vitest'
import { wasteBalanceResponseSchema } from './response.schema.js'

describe('wasteBalanceResponseSchema', () => {
  it('validates a correct response with single accreditation', () => {
    const response = {
      '507f1f77bcf86cd799439011': {
        amount: 1000,
        availableAmount: 750
      }
    }

    const { error } = wasteBalanceResponseSchema.validate(response)
    expect(error).toBeUndefined()
  })

  it('validates a correct response with multiple accreditations', () => {
    const response = {
      '507f1f77bcf86cd799439011': {
        amount: 1000,
        availableAmount: 750
      },
      '507f191e810c19729de860ea': {
        amount: 2500,
        availableAmount: 2500
      }
    }

    const { error } = wasteBalanceResponseSchema.validate(response)
    expect(error).toBeUndefined()
  })

  it('validates zero balances', () => {
    const response = {
      '000000000000000000000000': {
        amount: 0,
        availableAmount: 0
      }
    }

    const { error } = wasteBalanceResponseSchema.validate(response)
    expect(error).toBeUndefined()
  })

  it('rejects invalid accreditation ID format', () => {
    const response = {
      'invalid-id': {
        amount: 100,
        availableAmount: 100
      }
    }

    const { error } = wasteBalanceResponseSchema.validate(response)
    expect(error).toBeDefined()
  })

  it('rejects missing amount field', () => {
    const response = {
      '507f1f77bcf86cd799439011': {
        availableAmount: 750
      }
    }

    const { error } = wasteBalanceResponseSchema.validate(response)
    expect(error).toBeDefined()
  })

  it('rejects missing availableAmount field', () => {
    const response = {
      '507f1f77bcf86cd799439011': {
        amount: 1000
      }
    }

    const { error } = wasteBalanceResponseSchema.validate(response)
    expect(error).toBeDefined()
  })

  it('validates empty response object', () => {
    const response = {}

    const { error } = wasteBalanceResponseSchema.validate(response)
    expect(error).toBeUndefined()
  })
})
