import { describe, expect, it } from 'vitest'

import { isOneOf } from './is-one-of.js'

describe('is-one-of', () => {
  const statuses = /** @type {const} */ (['approved', 'cancelled'])

  it('should return true for a value in the list', () => {
    expect(isOneOf(statuses, 'cancelled')).toBe(true)
  })

  it.each([
    { value: 'suspended', label: 'a value not in the list' },
    { value: undefined, label: 'undefined' }
  ])('should return false for $label', ({ value }) => {
    expect(isOneOf(statuses, value)).toBe(false)
  })
})
