import { toYear } from '#common/helpers/dates/year.js'
import { describe, expect, it } from 'vitest'
import {
  isRegistrationAccredited,
  isRegistrationActiveInYear,
  resolveAccreditationNumber,
  resolveAccreditationByNumber,
  accreditationsForRegistration,
  resolveMaterial
} from './registration-utils.js'
import {
  toAccreditationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'

/** @import { AccreditationStatus, GlassRecyclingProcess, Organisation } from '#domain/organisations/model.js' */
/** @import { Registration } from '#domain/organisations/registration.js' */

const userFixture = {
  fullName: 'Test User',
  email: 'test@example.com',
  phone: '01234567890'
}

/** @type {Organisation} */
const orgFixture = {
  id: 'org-1',
  orgId: 500001,
  accreditations: [],
  registrations: [],
  companyDetails: { name: 'Acme Ltd' },
  formSubmission: { id: 'fs-1', time: new Date('2026-01-01') },
  schemaVersion: 1,
  status: 'active',
  statusHistory: [{ status: 'approved', updatedAt: new Date('2026-01-01') }],
  submittedToRegulator: 'ea',
  submitterContactDetails: userFixture,
  users: [],
  version: 1,
  wasteProcessingTypes: []
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

/** @returns {Organisation} */
const buildOrg = (overrides = {}) => ({ ...orgFixture, ...overrides })

/** @returns {Registration} */
const buildReg = (overrides = {}) => ({ ...regFixture, ...overrides })

// ---------------------------------------------------------------------------
// isRegistrationAccredited
// ---------------------------------------------------------------------------

describe('isRegistrationAccredited', () => {
  /** @type {Array<{ status: AccreditationStatus, expected: boolean }>} */
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
// resolveAccreditationNumber
// ---------------------------------------------------------------------------

describe('resolveAccreditationNumber', () => {
  it.each([
    {
      name: 'returns accreditationNumber for an approved accreditation',
      status: 'approved',
      accreditationNumber: 'ACC-001',
      regAccreditationId: 'acc-1',
      expected: 'ACC-001'
    },
    {
      name: 'returns accreditationNumber for a suspended accreditation',
      status: 'suspended',
      accreditationNumber: 'ACC-999',
      regAccreditationId: 'acc-1',
      expected: 'ACC-999'
    },
    {
      name: 'returns empty string when registration has no accreditationId',
      status: 'approved',
      accreditationNumber: 'ACC-001',
      regAccreditationId: null,
      expected: ''
    },
    {
      name: 'returns empty string when accreditation status is created',
      status: 'created',
      accreditationNumber: 'ACC-001',
      regAccreditationId: 'acc-1',
      expected: ''
    },
    {
      name: 'returns empty string when accreditation status is rejected',
      status: 'rejected',
      accreditationNumber: 'ACC-001',
      regAccreditationId: 'acc-1',
      expected: ''
    },
    {
      name: 'returns empty string when accreditation has null accreditationNumber',
      status: 'approved',
      accreditationNumber: null,
      regAccreditationId: 'acc-1',
      expected: ''
    }
  ])(
    '$name',
    ({ status, accreditationNumber, regAccreditationId, expected }) => {
      const org = buildOrg({
        accreditations: [{ id: 'acc-1', status, accreditationNumber }]
      })
      const reg = buildReg({ accreditationId: regAccreditationId })

      expect(resolveAccreditationNumber(reg, org)).toBe(expected)
    }
  )
})

// ---------------------------------------------------------------------------
// resolveAccreditationByNumber
// ---------------------------------------------------------------------------

describe('resolveAccreditationByNumber', () => {
  const number = toAccreditationNumber('ACC-1')
  const accreditationFixture = {
    id: 'acc-1',
    accreditationNumber: number,
    status: 'approved',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    statusHistory: []
  }

  it.each(['approved', 'suspended'])(
    'returns the %s accreditation with the number',
    (status) => {
      const accreditation = { ...accreditationFixture, status }
      const org = buildOrg({ accreditations: [accreditation] })

      expect(resolveAccreditationByNumber(number, org)).toBe(accreditation)
    }
  )

  it('returns null for a registered-only ledger', () => {
    const org = buildOrg({ accreditations: [accreditationFixture] })

    expect(resolveAccreditationByNumber(null, org)).toBeNull()
  })

  it('returns null when no accreditation has the number', () => {
    const org = buildOrg({ accreditations: [accreditationFixture] })

    expect(
      resolveAccreditationByNumber(toAccreditationNumber('ACC-2'), org)
    ).toBeNull()
  })

  it('returns null when the accreditation with the number is cancelled', () => {
    const cancelled = { ...accreditationFixture, status: 'cancelled' }
    const org = buildOrg({ accreditations: [cancelled] })

    expect(resolveAccreditationByNumber(number, org)).toBeNull()
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

// ---------------------------------------------------------------------------
// accreditationsForRegistration
// ---------------------------------------------------------------------------

describe('accreditationsForRegistration', () => {
  const accreditationFixture = {
    id: 'acc-1',
    accreditationNumber: 'ACC-001',
    status: 'approved',
    statusHistory: [],
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    material: 'plastic',
    wasteProcessingType: 'reprocessor'
  }

  it('returns the accreditation the registration names', () => {
    const reg = buildReg({ accreditationId: 'acc-1' })
    const org = buildOrg({
      registrations: [reg],
      accreditations: [accreditationFixture]
    })

    expect(accreditationsForRegistration(reg, org)).toEqual([
      accreditationFixture
    ])
  })

  it('returns an empty list when the registration names no accreditation', () => {
    const reg = buildReg({ accreditationId: null })
    const org = buildOrg({
      registrations: [reg],
      accreditations: [accreditationFixture]
    })

    expect(accreditationsForRegistration(reg, org)).toEqual([])
  })

  it('returns an empty list when the organisation holds no accreditation of that id', () => {
    const reg = buildReg({ accreditationId: 'acc-9' })
    const org = buildOrg({
      registrations: [reg],
      accreditations: [accreditationFixture]
    })

    expect(accreditationsForRegistration(reg, org)).toEqual([])
  })
})

describe('isRegistrationActiveInYear', () => {
  /**
   * @param {{ current?: 'approved' | 'cancelled', validFrom?: string }} [overrides]
   */
  const buildRegistration = ({
    current = 'approved',
    validFrom = '2025-01-01'
  } = {}) => ({
    status: { current, timeline: [] },
    validFrom
  })

  it('is true when approved and validFrom is on or before the year ends', () => {
    expect(
      isRegistrationActiveInYear(
        buildRegistration({ validFrom: '2025-06-01' }),
        toYear(2025)
      )
    ).toBe(true)
  })

  it('is true for a later year, since a registration never expires', () => {
    expect(
      isRegistrationActiveInYear(
        buildRegistration({ validFrom: '2025-06-01' }),
        toYear(2030)
      )
    ).toBe(true)
  })

  it('is false for a year before validFrom', () => {
    expect(
      isRegistrationActiveInYear(
        buildRegistration({ validFrom: '2026-01-01' }),
        toYear(2025)
      )
    ).toBe(false)
  })

  it('is false when cancelled', () => {
    expect(
      isRegistrationActiveInYear(
        buildRegistration({ current: 'cancelled', validFrom: '2025-01-01' }),
        toYear(2025)
      )
    ).toBe(false)
  })
})
