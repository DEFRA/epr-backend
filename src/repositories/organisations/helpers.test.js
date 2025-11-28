import { describe, it, expect } from 'vitest'
import {
  statusHistoryWithChanges,
  hasChanges,
  createUsersFromSubmitter
} from './helpers.js'
import { buildOrganisation } from './contract/test-data.js'

describe('statusHistoryWithChanges', () => {
  it('returns initial status history when existingItem is null', () => {
    const updatedItem = { status: 'approved' }
    const result = statusHistoryWithChanges(updatedItem, null)

    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('created')
    expect(result[0].updatedAt).toBeInstanceOf(Date)
  })

  it('returns initial status history when existingItem is undefined', () => {
    const updatedItem = { status: 'approved' }
    const result = statusHistoryWithChanges(updatedItem, undefined)

    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('created')
    expect(result[0].updatedAt).toBeInstanceOf(Date)
  })

  it('returns initial status history when existingItem is falsy', () => {
    const updatedItem = {}
    const result = statusHistoryWithChanges(updatedItem, null)

    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('created')
    expect(result[0].updatedAt).toBeInstanceOf(Date)
  })
})

describe('hasChanges', () => {
  it('detects no changes when only repository-managed fields differ', () => {
    const org1 = buildOrganisation()
    const org2 = buildOrganisation({
      id: org1.id,
      orgId: org1.orgId,
      version: org1.version + 5,
      status: 'approved',
      statusHistory: [...org1.statusHistory, { status: 'approved' }]
    })

    expect(hasChanges(org1, org2)).toBe(false)
  })

  it('detects changes in organisation fields', () => {
    const org1 = buildOrganisation()
    const org2 = buildOrganisation({
      id: org1.id,
      orgId: org1.orgId,
      companyDetails: { ...org1.companyDetails, name: 'Different Name' }
    })

    expect(hasChanges(org1, org2)).toBe(true)
  })

  it('detects changes in registration', () => {
    const org1 = buildOrganisation()
    const org2 = buildOrganisation({
      id: org1.id,
      orgId: org1.orgId,
      registrations: [{ ...org1.registrations[0], cbduNumber: 'CHANGED123' }]
    })

    expect(hasChanges(org1, org2)).toBe(true)
  })

  it('ignores null and undefined field differences', () => {
    const org1 = buildOrganisation({
      companyDetails: { name: 'Test', tradingName: null }
    })
    const org2 = buildOrganisation({
      id: org1.id,
      orgId: org1.orgId,
      companyDetails: {
        name: 'Test',
        tradingName: undefined,
        registrationNumber: null
      }
    })

    expect(hasChanges(org1, org2)).toBe(false)
  })

  it('treats empty arrays and undefined as equivalent', () => {
    const org1 = buildOrganisation({ registrations: [], accreditations: [] })
    const org2 = buildOrganisation({
      id: org1.id,
      orgId: org1.orgId,
      registrations: undefined,
      accreditations: undefined
    })

    expect(hasChanges(org1, org2)).toBe(false)
  })

  it('handles arrays with null/undefined items', () => {
    const baseOrg = buildOrganisation()
    const org1 = {
      ...baseOrg,
      registrations: [null, baseOrg.registrations[0], undefined]
    }
    const org2 = {
      ...baseOrg,
      id: org1.id,
      orgId: org1.orgId,
      registrations: [null, baseOrg.registrations[0], undefined]
    }

    expect(hasChanges(org1, org2)).toBe(false)
  })

  it('handles null and undefined organisations', () => {
    const org = buildOrganisation()

    expect(hasChanges(null, null)).toBe(false)
    expect(hasChanges(undefined, undefined)).toBe(false)
    expect(hasChanges(org, null)).toBe(true)
  })
})

describe('createUsersFromSubmitter', () => {
  it('should return empty array when submitterContactDetails is null', () => {
    const result = createUsersFromSubmitter(null)
    expect(result).toEqual([])
  })

  it('should return empty array when submitterContactDetails is undefined', () => {
    const result = createUsersFromSubmitter(undefined)
    expect(result).toEqual([])
  })
})
