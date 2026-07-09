import { describe, expect, it } from 'vitest'
import {
  activeAccreditationValidFrom,
  getReportableRegistrations,
  isRegistrationAccredited,
  resolveAccreditationNumber,
  resolveAccreditation,
  resolveDetailedMaterial
} from './registration-utils.js'

/** @import { Organisation } from '#domain/organisations/model.js' */
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
  wasteProcessingType: 'reprocessor',
  registrationNumber: 'REG-001',
  status: 'approved',
  validFrom: '2026-01-01',
  validTo: '2026-12-31'
}

/** @returns {Organisation} */
const buildOrg = (overrides = {}) => ({ ...orgFixture, ...overrides })

/** @returns {Registration} */
const buildReg = (overrides = {}) => ({ ...regFixture, ...overrides })

// ---------------------------------------------------------------------------
// getReportableRegistrations
// ---------------------------------------------------------------------------

describe('getReportableRegistrations', () => {
  it('includes approved registrations', () => {
    const org = buildOrg({ registrations: [buildReg({ status: 'approved' })] })

    const result = getReportableRegistrations([org])

    expect(result).toHaveLength(1)
    expect(result[0].registration.status).toBe('approved')
  })

  it('includes suspended registrations', () => {
    const org = buildOrg({ registrations: [buildReg({ status: 'suspended' })] })

    expect(getReportableRegistrations([org])).toHaveLength(1)
  })

  it('includes cancelled registrations', () => {
    const org = buildOrg({ registrations: [buildReg({ status: 'cancelled' })] })

    expect(getReportableRegistrations([org])).toHaveLength(1)
  })

  it('excludes created registrations', () => {
    const org = buildOrg({ registrations: [buildReg({ status: 'created' })] })

    expect(getReportableRegistrations([org])).toHaveLength(0)
  })

  it('excludes rejected registrations', () => {
    const org = buildOrg({ registrations: [buildReg({ status: 'rejected' })] })

    expect(getReportableRegistrations([org])).toHaveLength(0)
  })

  it('excludes test organisations by orgId', () => {
    const testOrg = buildOrg({
      orgId: 999999,
      registrations: [buildReg({ status: 'approved' })]
    })

    expect(getReportableRegistrations([testOrg])).toHaveLength(0)
  })

  it('flattens registrations across multiple orgs', () => {
    const org1 = buildOrg({
      id: 'org-1',
      registrations: [buildReg({ id: 'reg-1', status: 'approved' })]
    })
    const org2 = buildOrg({
      id: 'org-2',
      registrations: [buildReg({ id: 'reg-2', status: 'approved' })]
    })

    const result = getReportableRegistrations([org1, org2])

    expect(result).toHaveLength(2)
    expect(result.map((r) => r.registration.id)).toEqual(['reg-1', 'reg-2'])
  })

  it('pairs each registration with its org', () => {
    const org = buildOrg({ registrations: [buildReg({ status: 'approved' })] })

    const result = getReportableRegistrations([org])

    expect(result[0].org).toBe(org)
  })
})

// ---------------------------------------------------------------------------
// isRegistrationAccredited
// ---------------------------------------------------------------------------

describe('isRegistrationAccredited', () => {
  it.each([
    { status: 'approved', expected: true },
    { status: 'suspended', expected: true },
    { status: 'created', expected: false },
    { status: 'rejected', expected: false },
    { status: 'cancelled', expected: false }
  ])(
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
// activeAccreditationValidFrom
// ---------------------------------------------------------------------------

describe('activeAccreditationValidFrom', () => {
  it.each(['approved', 'suspended'])(
    'returns validFrom when accreditation status is %s',
    (status) => {
      expect(
        activeAccreditationValidFrom({ status, validFrom: '2026-03-15' })
      ).toBe('2026-03-15')
    }
  )

  it.each(['created', 'rejected', 'cancelled'])(
    'returns null when accreditation status is %s',
    (status) => {
      expect(
        activeAccreditationValidFrom({ status, validFrom: '2026-03-15' })
      ).toBeNull()
    }
  )

  it('returns null when accreditation is null', () => {
    expect(activeAccreditationValidFrom(null)).toBeNull()
  })

  it('returns null when accreditation is undefined', () => {
    expect(activeAccreditationValidFrom(undefined)).toBeNull()
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
// resolveAccreditation
// ---------------------------------------------------------------------------

describe('resolveAccreditation', () => {
  const accreditationFixture = {
    id: 'acc-1',
    status: 'approved',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    statusHistory: []
  }

  it('returns accreditation from org.accreditations when status is approved', () => {
    const org = buildOrg({ accreditations: [accreditationFixture] })
    const reg = buildReg({ accreditationId: 'acc-1' })

    expect(resolveAccreditation(reg, org)).toBe(accreditationFixture)
  })

  it('returns accreditation from org.accreditations when status is suspended', () => {
    const suspended = { ...accreditationFixture, status: 'suspended' }
    const org = buildOrg({ accreditations: [suspended] })
    const reg = buildReg({ accreditationId: 'acc-1' })

    expect(resolveAccreditation(reg, org)).toBe(suspended)
  })

  it('returns null when registration has no accreditationId', () => {
    const org = buildOrg({ accreditations: [accreditationFixture] })
    const reg = buildReg({ accreditationId: null })

    expect(resolveAccreditation(reg, org)).toBeNull()
  })

  it('returns null when accreditationId does not match any entry in org.accreditations', () => {
    const org = buildOrg({ accreditations: [accreditationFixture] })
    const reg = buildReg({ accreditationId: 'acc-unknown' })

    expect(resolveAccreditation(reg, org)).toBeNull()
  })

  it('returns null when matched accreditation has a non-active status', () => {
    const cancelled = { ...accreditationFixture, status: 'cancelled' }
    const org = buildOrg({ accreditations: [cancelled] })
    const reg = buildReg({ accreditationId: 'acc-1' })

    expect(resolveAccreditation(reg, org)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// resolveDetailedMaterial
// ---------------------------------------------------------------------------

describe('resolveDetailedMaterial', () => {
  it('returns the glass recycling process for a glass registration', () => {
    const reg = buildReg({
      material: 'glass',
      glassRecyclingProcess: ['glass_re_melt']
    })

    expect(resolveDetailedMaterial(reg)).toBe('glass_re_melt')
  })

  it('returns glass_other for a glass-other registration', () => {
    const reg = buildReg({
      material: 'glass',
      glassRecyclingProcess: ['glass_other']
    })

    expect(resolveDetailedMaterial(reg)).toBe('glass_other')
  })

  it('returns glass when a glass registration has no recycling process', () => {
    const reg = buildReg({ material: 'glass' })

    expect(resolveDetailedMaterial(reg)).toBe('glass')
  })

  it('returns glass when the recycling process array is empty', () => {
    const reg = buildReg({ material: 'glass', glassRecyclingProcess: [] })

    expect(resolveDetailedMaterial(reg)).toBe('glass')
  })

  it('returns the material unchanged for non-glass registrations', () => {
    const reg = buildReg({ material: 'plastic' })

    expect(resolveDetailedMaterial(reg)).toBe('plastic')
  })
})
