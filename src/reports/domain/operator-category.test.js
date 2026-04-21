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
      scenario: 'registered-only exporter (no accreditationId)',
      registration: { wasteProcessingType: 'exporter' },
      expected: 'EXPORTER_REGISTERED_ONLY'
    },
    {
      scenario: 'accredited exporter (approved)',
      registration: {
        wasteProcessingType: 'exporter',
        accreditationId: 'acc-123',
        accreditation: { status: 'approved' }
      },
      expected: 'EXPORTER'
    },
    {
      scenario: 'accredited exporter (suspended)',
      registration: {
        wasteProcessingType: 'exporter',
        accreditationId: 'acc-123',
        accreditation: { status: 'suspended' }
      },
      expected: 'EXPORTER'
    },
    {
      scenario: 'exporter with created accreditation (not yet approved)',
      registration: {
        wasteProcessingType: 'exporter',
        accreditationId: 'acc-123',
        accreditation: { status: 'created' }
      },
      expected: 'EXPORTER_REGISTERED_ONLY'
    },
    {
      scenario: 'exporter with rejected accreditation',
      registration: {
        wasteProcessingType: 'exporter',
        accreditationId: 'acc-123',
        accreditation: { status: 'rejected' }
      },
      expected: 'EXPORTER_REGISTERED_ONLY'
    },
    {
      scenario: 'exporter with cancelled accreditation',
      registration: {
        wasteProcessingType: 'exporter',
        accreditationId: 'acc-123',
        accreditation: { status: 'cancelled' }
      },
      expected: 'EXPORTER_REGISTERED_ONLY'
    },
    {
      scenario: 'exporter with accreditationId but no hydrated accreditation',
      registration: {
        wasteProcessingType: 'exporter',
        accreditationId: 'acc-123',
        accreditation: null
      },
      expected: 'EXPORTER_REGISTERED_ONLY'
    },
    {
      scenario: 'registered-only reprocessor (no accreditationId)',
      registration: { wasteProcessingType: 'reprocessor' },
      expected: 'REPROCESSOR_REGISTERED_ONLY'
    },
    {
      scenario: 'accredited reprocessor (approved)',
      registration: {
        wasteProcessingType: 'reprocessor',
        accreditationId: 'acc-456',
        accreditation: { status: 'approved' }
      },
      expected: 'REPROCESSOR'
    },
    {
      scenario: 'accredited reprocessor (suspended)',
      registration: {
        wasteProcessingType: 'reprocessor',
        accreditationId: 'acc-456',
        accreditation: { status: 'suspended' }
      },
      expected: 'REPROCESSOR'
    },
    {
      scenario: 'reprocessor with created accreditation (not yet approved)',
      registration: {
        wasteProcessingType: 'reprocessor',
        accreditationId: 'acc-456',
        accreditation: { status: 'created' }
      },
      expected: 'REPROCESSOR_REGISTERED_ONLY'
    },
    {
      scenario: 'reprocessor with rejected accreditation',
      registration: {
        wasteProcessingType: 'reprocessor',
        accreditationId: 'acc-456',
        accreditation: { status: 'rejected' }
      },
      expected: 'REPROCESSOR_REGISTERED_ONLY'
    },
    {
      scenario: 'reprocessor with cancelled accreditation',
      registration: {
        wasteProcessingType: 'reprocessor',
        accreditationId: 'acc-456',
        accreditation: { status: 'cancelled' }
      },
      expected: 'REPROCESSOR_REGISTERED_ONLY'
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
