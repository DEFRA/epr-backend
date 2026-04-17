import { describe, expect, it } from 'vitest'

import { isNil } from './is-nil.js'

describe('is-nil', () => {
  it.each([
    { value: null, label: 'null' },
    { value: undefined, label: 'undefined' }
  ])('should return true for $label', ({ value }) => {
    expect(isNil(value)).toBe(true)
  })

  it.each([
    { value: 0, label: '0' },
    { value: '', label: 'empty string' },
    { value: false, label: 'false' },
    { value: NaN, label: 'NaN' },
    { value: {}, label: 'empty object' },
    { value: [], label: 'empty array' }
  ])('should return false for $label', ({ value }) => {
    expect(isNil(value)).toBe(false)
  })
})
