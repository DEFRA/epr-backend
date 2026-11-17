import { toYear } from '#common/helpers/dates/year.js'
import { describe, expect, it } from 'vitest'
import {
  isRegistrationAccredited,
  isRegistrationActiveInYear,
  resolveMaterial
} from './registration-utils.js'
import { toRegistrationNumber } from '#domain/organisations/numbers.js'

/** @import { StoredAccreditationStatus, GlassRecyclingProcess } from '#domain/organisations/model.js' */
/** @import { Registration } from '#domain/organisations/registration.js' */

const userFixture = {
  fullName: 'Test User',
  email: 'test@example.com',
  phone: '01234567890'
}

/** @type {Registration} */
const regFixture = {
  id: 'reg-1',
  statusHistory: [{ status: 'approved', updatedAt: '2026-01-01' }],
  accreditation: null,
  applicationContactDetails: userFixture,
  approvedPersons: [],
  formSubmission: { id: 'fs-1', time: new Date('2026-01-01') },
  material: 'plastic',
  orgName: 'Acme Ltd',
  site: {
    address: {},
    gridReference: 'TQ123456',
    siteCapacity: []
  },
  submittedToRegulator: 'ea',
  submitterContactDetails: userFixture,
  suppliers: 'Local authority kerbside collections',
  wasteProcessingType: 'reprocessor',
  registrationNumber: toRegistrationNumber('REG-001'),
  samplingInspectionPlanPart1FileUploads: [],
  status: 'approved',
  validFrom: '2026-01-01'
}

/** @returns {Registration} */
const buildReg = (overrides = {}) => ({ ...regFixture, ...overrides })

// ---------------------------------------------------------------------------
// isRegistrationAccredited
// ---------------------------------------------------------------------------

describe('isRegistrationAccredited', () => {
  /** @type {Array<{ status: StoredAccreditationStatus, expected: boolean }>} */
  const linkedAccreditations = [
    { status: 'approved', expected: true },
    { status: 'suspended', expected: true },
    { status: 'created', expected: false },
    { status: 'rejected', expected: false },
    { status: 'cancelled', expected: false }
  ]

  it.each(linkedAccreditations)(
    'returns $expected when linked accreditation status is $status',
    ({ status, expected }) => {
      expect(isRegistrationAccredited({ accreditation: { status } })).toBe(
        expected
      )
    }
  )

  it('returns false when accreditation is null', () => {
    expect(isRegistrationAccredited({ accreditation: null })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// resolveMaterial
// ---------------------------------------------------------------------------

describe('resolveMaterial', () => {
  it('returns the glass recycling process for a glass registration', () => {
    const reg = buildReg({
      material: 'glass',
      glassRecyclingProcess: ['glass_re_melt']
    })

    expect(resolveMaterial(reg)).toBe('glass_re_melt')
  })

  it('returns glass_other for a glass-other registration', () => {
    const reg = buildReg({
      material: 'glass',
      glassRecyclingProcess: ['glass_other']
    })

    expect(resolveMaterial(reg)).toBe('glass_other')
  })

  /** @type {Array<[string, GlassRecyclingProcess[] | undefined]>} */
  const unsplitCases = [
    ['no recycling process', undefined],
    ['an empty recycling process list', []],
    ['both recycling processes', ['glass_re_melt', 'glass_other']]
  ]

  it.each(unsplitCases)(
    'throws, naming the record, when the applied for material is glass and the record carries %s',
    (_label, glassRecyclingProcess) => {
      const reg = buildReg({
        id: 'reg-unsplit',
        material: 'glass',
        glassRecyclingProcess
      })

      expect(() => resolveMaterial(reg)).toThrow(
        'Record reg-unsplit applied for glass but does not carry exactly one recycling process'
      )
    }
  )

  it('returns the material unchanged for non-glass registrations', () => {
    const reg = buildReg({ material: 'plastic' })

    expect(resolveMaterial(reg)).toBe('plastic')
  })
})

describe('isRegistrationActiveInYear', () => {
  /**
   * @param {{ current?: 'approved' | 'cancelled', approvedFrom?: string }} [overrides]
   */
  const buildRegistration = ({
    current = 'approved',
    approvedFrom = '2025-01-01'
  } = {}) => {
    const at = new Date(approvedFrom).toISOString()
    return {
      status: {
        current,
        lastUpdatedAt: at,
        timeline: [{ status: /** @type {const} */ ('approved'), at }]
      }
    }
  }

  it('is true when approved on or before the year ends', () => {
    expect(
      isRegistrationActiveInYear(
        buildRegistration({ approvedFrom: '2025-06-01' }),
        toYear(2025)
      )
    ).toBe(true)
  })

  it('is true for a later year, since a registration never expires', () => {
    expect(
      isRegistrationActiveInYear(
        buildRegistration({ approvedFrom: '2025-06-01' }),
        toYear(2030)
      )
    ).toBe(true)
  })

  it('is false for a year before its approval takes effect', () => {
    expect(
      isRegistrationActiveInYear(
        buildRegistration({ approvedFrom: '2026-01-01' }),
        toYear(2025)
      )
    ).toBe(false)
  })

  it('is false when cancelled', () => {
    expect(
      isRegistrationActiveInYear(
        buildRegistration({ current: 'cancelled', approvedFrom: '2025-01-01' }),
        toYear(2025)
      )
    ).toBe(false)
  })

  it('is false when approved but its timeline holds no approval', () => {
    expect(
      isRegistrationActiveInYear(
        {
          status: {
            current: 'approved',
            lastUpdatedAt: '2025-01-01T00:00:00.000Z',
            timeline: [{ status: 'cancelled', at: '2025-01-01T00:00:00.000Z' }]
          }
        },
        toYear(2025)
      )
    ).toBe(false)
  })
})
