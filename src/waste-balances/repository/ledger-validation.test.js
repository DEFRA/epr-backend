import { describe, it, expect } from 'vitest'
import { ObjectId } from 'mongodb'

import {
  validateLedgerTransactionInsert,
  validateLedgerTransactionRead
} from './ledger-validation.js'
import { buildLedgerTransaction } from './ledger-test-data.js'

describe('validateLedgerTransactionInsert', () => {
  it('returns validated value for valid data', () => {
    const data = buildLedgerTransaction()
    const result = validateLedgerTransactionInsert(data)
    expect(result.accreditationId).toBe(data.accreditationId)
    expect(result.number).toBe(data.number)
    expect(result.source.kind).toBe(data.source.kind)
  })

  it('strips unknown fields', () => {
    const data = buildLedgerTransaction({ bogus: 'field' })
    const result = validateLedgerTransactionInsert(data)
    expect(result.bogus).toBeUndefined()
  })

  it('throws Boom.badData for invalid data', () => {
    const data = buildLedgerTransaction()
    delete data.organisationId

    let thrownError
    try {
      validateLedgerTransactionInsert(data)
    } catch (e) {
      thrownError = e
    }

    expect(thrownError?.isBoom).toBe(true)
    expect(thrownError?.output.statusCode).toBe(422)
    expect(thrownError?.message).toContain('Invalid ledger transaction data')
  })

  it('reports all validation errors, not just the first', () => {
    const data = buildLedgerTransaction()
    delete data.organisationId
    delete data.registrationId
    delete data.number

    let thrownError
    try {
      validateLedgerTransactionInsert(data)
    } catch (e) {
      thrownError = e
    }

    expect(thrownError?.message).toContain('organisationId')
    expect(thrownError?.message).toContain('registrationId')
    expect(thrownError?.message).toContain('number')
  })
})

describe('validateLedgerTransactionRead', () => {
  const buildReadDocument = (overrides = {}) => ({
    id: '507f1f77bcf86cd799439011',
    ...buildLedgerTransaction(),
    ...overrides
  })

  it('returns validated value for valid read document', () => {
    const data = buildReadDocument()
    const result = validateLedgerTransactionRead(data)
    expect(result.id).toBe('507f1f77bcf86cd799439011')
    expect(result.accreditationId).toBe(data.accreditationId)
  })

  it('strips MongoDB _id from read documents', () => {
    const objectId = new ObjectId()
    const data = { ...buildReadDocument(), _id: objectId }
    const result = validateLedgerTransactionRead(data)
    expect(result._id).toBeUndefined()
    expect(result.id).toBe('507f1f77bcf86cd799439011')
  })

  it('throws Boom.badImplementation for invalid read data', () => {
    const data = buildReadDocument()
    delete data.id

    let thrownError
    try {
      validateLedgerTransactionRead(data)
    } catch (e) {
      thrownError = e
    }

    expect(thrownError?.isBoom).toBe(true)
    expect(thrownError?.output.statusCode).toBe(500)
    expect(thrownError?.message).toContain('Invalid ledger transaction')
  })

  it('includes the document id in the error message', () => {
    const data = buildReadDocument({ id: 'abc-123' })
    delete data.source

    let thrownError
    try {
      validateLedgerTransactionRead(data)
    } catch (e) {
      thrownError = e
    }

    expect(thrownError?.message).toContain('abc-123')
  })

  it('reports all validation errors, not just the first', () => {
    const data = buildReadDocument()
    delete data.id
    delete data.organisationId
    delete data.source

    let thrownError
    try {
      validateLedgerTransactionRead(data)
    } catch (e) {
      thrownError = e
    }

    expect(thrownError?.message).toContain('id')
    expect(thrownError?.message).toContain('organisationId')
    expect(thrownError?.message).toContain('source')
  })
})
