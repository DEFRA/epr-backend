import { describe, expect, it } from 'vitest'
import { tonnage, wholeTonnage } from './tonnage-schema.js'
import { expectValidationError } from './validation-test-helpers.js'

describe('#tonnage', () => {
  it('accepts a whole number', () => {
    const { error, value } = tonnage().validate(100)

    expect(error).toBeUndefined()
    expect(value).toBe(100)
  })

  it('accepts a decimal', () => {
    const { error } = tonnage().validate(100.5)

    expect(error).toBeUndefined()
  })

  it('rejects a negative value', () => {
    const [detail] = expectValidationError(tonnage(), -1)

    expect(detail.type).toBe('number.min')
  })
})

describe('#wholeTonnage', () => {
  it('accepts a whole number', () => {
    const { error, value } = wholeTonnage().validate(100)

    expect(error).toBeUndefined()
    expect(value).toBe(100)
  })

  it('accepts zero', () => {
    const { error } = wholeTonnage().validate(0)

    expect(error).toBeUndefined()
  })

  it('rejects a decimal value', () => {
    const [detail] = expectValidationError(wholeTonnage(), 100.5)

    expect(detail.type).toBe('number.integer')
  })

  it('rejects a negative value', () => {
    const [detail] = expectValidationError(wholeTonnage(), -1)

    expect(detail.type).toBe('number.min')
  })
})
