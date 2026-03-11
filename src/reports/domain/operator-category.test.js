import { describe, expect, it } from 'vitest'
import { OPERATOR_CATEGORY, getOperatorCategory } from './operator-category.js'

describe('OPERATOR_CATEGORY', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(OPERATOR_CATEGORY)).toBe(true)
  })
})

describe('getOperatorCategory', () => {
  it.each([
    {
      scenario: 'registered-only exporter',
      registration: { wasteProcessingType: 'exporter' },
      expected: 'EXPORTER_REGISTERED_ONLY'
    },
    {
      scenario: 'accredited exporter',
      registration: {
        wasteProcessingType: 'exporter',
        accreditationId: 'acc-123'
      },
      expected: 'EXPORTER'
    },
    {
      scenario: 'registered-only reprocessor',
      registration: { wasteProcessingType: 'reprocessor' },
      expected: 'REPROCESSOR_REGISTERED_ONLY'
    },
    {
      scenario: 'accredited reprocessor',
      registration: {
        wasteProcessingType: 'reprocessor',
        accreditationId: 'acc-456'
      },
      expected: 'REPROCESSOR'
    }
  ])('returns $expected for $scenario', ({ registration, expected }) => {
    expect(getOperatorCategory(registration)).toBe(expected)
  })

  it('throws for unknown wasteProcessingType', () => {
    expect(() => {
      getOperatorCategory({ wasteProcessingType: 'unknown' })
    }).toThrow('Unknown wasteProcessingType: unknown')
  })
})
