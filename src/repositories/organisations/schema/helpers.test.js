import { describe, expect, it, vi } from 'vitest'
import { validateImmutableFields } from './helpers.js'

describe('validateImmutableFields', () => {
  const fields = ['status']
  const validator = validateImmutableFields(fields)
  const contextOriginal = {
    registrations: [
      { id: '1', status: 'created', other: 'a' },
      { id: '2', status: 'approved', other: 'b' }
    ]
  }

  const createHelpers = (
    key = 'registrations',
    original = contextOriginal
  ) => ({
    prefs: {
      context: {
        original
      }
    },
    state: {
      path: ['organisations', key]
    },
    error: vi.fn((code, details) => ({ code, details }))
  })

  it('should pass if original context is missing', () => {
    const helpers = createHelpers('registrations', null)
    const value = [{ id: '1', status: 'modified' }]

    expect(validator(value, helpers)).toEqual(value)
    expect(helpers.error).not.toHaveBeenCalled()
  })

  it('should pass if original items is not an array', () => {
    const helpers = createHelpers('registrations', { registrations: null })
    const value = [{ id: '1', status: 'modified' }]

    expect(validator(value, helpers)).toEqual(value)
    expect(helpers.error).not.toHaveBeenCalled()
  })

  it('should ignore items without IDs (new items)', () => {
    const helpers = createHelpers()
    // Item without ID
    const value = [{ status: 'different' }]

    expect(validator(value, helpers)).toEqual(value)
    expect(helpers.error).not.toHaveBeenCalled()
  })

  it('should ignore items with IDs that do not exist in original (new items with client-generated IDs)', () => {
    const helpers = createHelpers()
    const value = [{ id: '999', status: 'different' }]

    expect(validator(value, helpers)).toEqual(value)
    expect(helpers.error).not.toHaveBeenCalled()
  })

  it('should pass if immutable fields are unchanged', () => {
    const helpers = createHelpers()
    const value = [
      { id: '1', status: 'created', other: 'modified' }, // status match
      { id: '2', status: 'approved', other: 'modified' } // status match
    ]

    expect(validator(value, helpers)).toEqual(value)
    expect(helpers.error).not.toHaveBeenCalled()
  })

  it('should fail if an immutable field is modified', () => {
    const helpers = createHelpers()
    const value = [{ id: '1', status: 'MODIFIED', other: 'a' }]

    const result = validator(value, helpers)

    expect(helpers.error).toHaveBeenCalledWith('any.invalid', {
      message: "Field 'status' cannot be modified"
    })
    expect(result).toEqual({
      code: 'any.invalid',
      details: { message: "Field 'status' cannot be modified" }
    })
  })

  it('should handle complex objects strict equality check', () => {
    const complexFields = ['meta']
    const complexValidator = validateImmutableFields(complexFields)
    const original = {
      items: [{ id: '1', meta: { a: 1, b: 2 } }]
    }
    const helpers = createHelpers('items', original)

    // Same content
    const valuePass = [{ id: '1', meta: { a: 1, b: 2 } }]
    expect(complexValidator(valuePass, helpers)).toEqual(valuePass)
    expect(helpers.error).not.toHaveBeenCalled()

    // Different content
    const valueFail = [{ id: '1', meta: { a: 1, b: 3 } }]
    complexValidator(valueFail, helpers)
    expect(helpers.error).toHaveBeenCalledWith('any.invalid', {
      message: "Field 'meta' cannot be modified"
    })
  })

  it('should handle deletion (item in original but not in value)', () => {
    const helpers = createHelpers()
    // Item 1 is removed, Item 2 remains unchanged
    const value = [{ id: '2', status: 'approved' }]

    expect(validator(value, helpers)).toEqual(value)
    expect(helpers.error).not.toHaveBeenCalled()
  })

  it('should handle reordering', () => {
    const helpers = createHelpers()
    // Swapped order
    const value = [
      { id: '2', status: 'approved' },
      { id: '1', status: 'created' }
    ]

    expect(validator(value, helpers)).toEqual(value)
    expect(helpers.error).not.toHaveBeenCalled()
  })
})
