import { describe, expect, it } from 'vitest'
import {
  getReportableRegistrations,
  resolveAccreditationNumber
} from './registration-utils.js'

const buildOrg = (overrides = {}) => ({
  id: 'org-1',
  orgId: 500001,
  companyDetails: { name: 'Acme Ltd' },
  accreditations: [],
  registrations: [],
  ...overrides
})

const buildReg = (overrides = {}) => ({
  id: 'reg-1',
  status: 'approved',
  accreditationId: null,
  registrationNumber: 'REG-001',
  ...overrides
})

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
// resolveAccreditationNumber
// ---------------------------------------------------------------------------

describe('resolveAccreditationNumber', () => {
  it('returns accreditationNumber for an approved accreditation', () => {
    const org = buildOrg({
      accreditations: [
        { id: 'acc-1', status: 'approved', accreditationNumber: 'ACC-001' }
      ]
    })
    const reg = buildReg({ accreditationId: 'acc-1' })

    expect(resolveAccreditationNumber(reg, org)).toBe('ACC-001')
  })

  it('returns accreditationNumber for a suspended accreditation', () => {
    const org = buildOrg({
      accreditations: [
        { id: 'acc-1', status: 'suspended', accreditationNumber: 'ACC-999' }
      ]
    })
    const reg = buildReg({ accreditationId: 'acc-1' })

    expect(resolveAccreditationNumber(reg, org)).toBe('ACC-999')
  })

  it('returns empty string when registration has no accreditationId', () => {
    const org = buildOrg({
      accreditations: [
        { id: 'acc-1', status: 'approved', accreditationNumber: 'ACC-001' }
      ]
    })
    const reg = buildReg({ accreditationId: null })

    expect(resolveAccreditationNumber(reg, org)).toBe('')
  })

  it('returns empty string when accreditation status is created', () => {
    const org = buildOrg({
      accreditations: [
        { id: 'acc-1', status: 'created', accreditationNumber: 'ACC-001' }
      ]
    })
    const reg = buildReg({ accreditationId: 'acc-1' })

    expect(resolveAccreditationNumber(reg, org)).toBe('')
  })

  it('returns empty string when accreditation status is rejected', () => {
    const org = buildOrg({
      accreditations: [
        { id: 'acc-1', status: 'rejected', accreditationNumber: 'ACC-001' }
      ]
    })
    const reg = buildReg({ accreditationId: 'acc-1' })

    expect(resolveAccreditationNumber(reg, org)).toBe('')
  })

  it('returns empty string when accreditation has null accreditationNumber', () => {
    const org = buildOrg({
      accreditations: [
        { id: 'acc-1', status: 'approved', accreditationNumber: null }
      ]
    })
    const reg = buildReg({ accreditationId: 'acc-1' })

    expect(resolveAccreditationNumber(reg, org)).toBe('')
  })
})
