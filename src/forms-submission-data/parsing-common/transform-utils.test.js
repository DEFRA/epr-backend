import { describe, expect, it } from 'vitest'
import { removeUndefinedValues } from './transform-utils.js'

describe('removeUndefinedValues', () => {
  it('should recursively remove properties with undefined values from objects', () => {
    const input = {
      id: 1,
      name: 'Widget',
      description: undefined,
      price: 0,
      isActive: true,
      details: {
        color: 'Red',
        size: undefined,
        weight: null,
        count: 0
      },
      tags: ['new', undefined, 'sale']
    }

    const expected = {
      id: 1,
      name: 'Widget',
      price: 0,
      isActive: true,
      details: {
        color: 'Red',
        weight: null,
        count: 0
      },
      tags: ['new', undefined, 'sale']
    }

    expect(removeUndefinedValues(input)).toStrictEqual(expected)
  })

  it('should handle special types and primitives correctly', () => {
    const testDate = new Date('2025-01-01T00:00:00.000Z')

    // Test an object with a Date and undefined properties
    const inputWithDate = {
      event: 'Launch',
      date: testDate,
      location: undefined,
      attendees: null
    }
    const expectedWithDate = {
      event: 'Launch',
      date: testDate,
      attendees: null
    }
    expect(removeUndefinedValues(inputWithDate)).toStrictEqual(expectedWithDate)

    expect(removeUndefinedValues('test')).toBe('test')
    expect(removeUndefinedValues(42)).toBe(42)
  })
})
