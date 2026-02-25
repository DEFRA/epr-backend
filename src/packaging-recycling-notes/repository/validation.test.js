import { describe, it, expect } from 'vitest'
import { ObjectId } from 'mongodb'
import { validatePrnInsert, validatePrnRead } from './validation.js'
import { buildPrn as buildValidPrnInsert } from './contract/test-data.js'

describe('validatePrnInsert', () => {
  it('returns validated value for valid data', () => {
    const data = buildValidPrnInsert()
    const result = validatePrnInsert(data)
    expect(result.schemaVersion).toBe(2)
    expect(result.organisation.id).toBe(data.organisation.id)
  })

  it('strips unknown fields', () => {
    const data = buildValidPrnInsert({ bogus: 'field' })
    const result = validatePrnInsert(data)
    expect(result.bogus).toBeUndefined()
  })

  it('preserves the provided currentStatusAt value', () => {
    const providedDate = new Date('2020-01-01T00:00:00.000Z')
    const data = buildValidPrnInsert({
      status: {
        currentStatus: 'draft',
        currentStatusAt: providedDate,
        history: [
          {
            status: 'draft',
            at: new Date('2025-06-15T12:00:00.000Z'),
            by: { id: 'user-1', name: 'Test User' }
          }
        ]
      }
    })

    const result = validatePrnInsert(data)

    expect(result.status.currentStatusAt).toEqual(providedDate)
  })

  it('throws Boom.badData for invalid data', () => {
    const data = buildValidPrnInsert()
    delete data.organisation

    let thrownError
    try { validatePrnInsert(data) } catch (e) { thrownError = e }

    expect(thrownError?.isBoom).toBe(true)
    expect(thrownError?.output.statusCode).toBe(422)
    expect(thrownError?.message).toContain('Invalid PRN data')
  })

  it('reports all validation errors, not just the first', () => {
    const data = buildValidPrnInsert()
    delete data.organisation
    delete data.accreditation
    delete data.tonnage

    let thrownError
    try { validatePrnInsert(data) } catch (e) { thrownError = e }

    expect(thrownError?.message).toContain('organisation')
    expect(thrownError?.message).toContain('accreditation')
    expect(thrownError?.message).toContain('tonnage')
  })
})

describe('validatePrnRead', () => {
  const buildReadDocument = (overrides = {}) => ({
    id: '507f1f77bcf86cd799439011',
    ...buildValidPrnInsert(),
    ...overrides
  })

  it('returns validated value for valid read document', () => {
    const data = buildReadDocument()
    const result = validatePrnRead(data)
    expect(result.id).toBe('507f1f77bcf86cd799439011')
    expect(result.schemaVersion).toBe(2)
  })

  it('strips MongoDB _id from read documents', () => {
    const objectId = new ObjectId()
    const data = { ...buildReadDocument(), _id: objectId }
    const result = validatePrnRead(data)
    expect(result._id).toBeUndefined()
    expect(result.id).toBe('507f1f77bcf86cd799439011')
  })

  it('coerces null notes to absent', () => {
    const data = buildReadDocument({ notes: null })
    const result = validatePrnRead(data)
    expect(result).not.toHaveProperty('notes')
  })

  it('throws Boom.badImplementation for invalid read data', () => {
    const data = buildReadDocument()
    delete data.id

    let thrownError
    try { validatePrnRead(data) } catch (e) { thrownError = e }

    expect(thrownError?.isBoom).toBe(true)
    expect(thrownError?.output.statusCode).toBe(500)
    expect(thrownError?.message).toContain('Invalid PRN document')
  })

  it('includes the document id in the error message', () => {
    const data = buildReadDocument({ id: 'abc-123' })
    delete data.organisation

    let thrownError
    try { validatePrnRead(data) } catch (e) { thrownError = e }

    expect(thrownError?.message).toContain('abc-123')
  })

  it('reports all validation errors, not just the first', () => {
    const data = buildReadDocument()
    delete data.id
    delete data.organisation
    delete data.tonnage

    let thrownError
    try { validatePrnRead(data) } catch (e) { thrownError = e }

    expect(thrownError?.message).toContain('id')
    expect(thrownError?.message).toContain('organisation')
    expect(thrownError?.message).toContain('tonnage')
  })
})
