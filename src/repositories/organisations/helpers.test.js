import { describe, it, expect } from 'vitest'
import {
  statusHistoryWithChanges,
  hasChanges,
  collateUsersOnApproval,
  createStatusHistoryEntry
} from './helpers.js'
import { buildOrganisation } from './contract/test-data.js'
import { STATUS } from '#domain/organisations/model.js'

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

describe('collateUsersOnApproval', () => {
  it('should return existing users when no submitterContactDetails and no status change', () => {
    const existing = buildOrganisation({
      submitterContactDetails: null,
      users: [
        {
          fullName: 'Existing User',
          email: 'existing@example.com',
          isInitialUser: true,
          roles: ['standard_user']
        }
      ]
    })
    const updated = {
      ...existing
    }

    const result = collateUsersOnApproval(existing, updated)

    expect(result).toBe(existing.users)
  })

  it('should include submitter when no registration status change to approved', () => {
    const existing = buildOrganisation({
      users: []
    })
    const updated = {
      ...existing
    }

    const result = collateUsersOnApproval(existing, updated)

    expect(result).toHaveLength(1)
    expect(result[0].email).toBe(existing.submitterContactDetails.email)
    expect(result[0].fullName).toBe(existing.submitterContactDetails.fullName)
  })

  it('should collate users when organisation status changes to approved', () => {
    const existing = buildOrganisation({
      users: []
    })
    const updated = buildOrganisation({
      id: existing.id
    })
    updated.statusHistory.push(createStatusHistoryEntry(STATUS.APPROVED))

    const result = collateUsersOnApproval(existing, updated)

    expect(result.length).toBeGreaterThan(0)
    expect(result[0].email).toBe(updated.submitterContactDetails.email)
  })

  it('should collate users when registration status changes to approved', () => {
    const existing = buildOrganisation({
      users: []
    })

    const updated = {
      ...existing,
      registrations: existing.registrations.map((reg) => ({
        ...reg,
        statusHistory: [
          ...reg.statusHistory,
          createStatusHistoryEntry(STATUS.APPROVED)
        ]
      }))
    }

    const result = collateUsersOnApproval(existing, updated)

    expect(result.length).toBeGreaterThan(0)
  })

  it('should collate users when accreditation status changes to approved', () => {
    const existing = buildOrganisation({
      users: []
    })

    const updated = {
      ...existing,
      accreditations: existing.accreditations.map((acc) => ({
        ...acc,
        statusHistory: [
          ...acc.statusHistory,
          createStatusHistoryEntry(STATUS.APPROVED)
        ]
      }))
    }

    const result = collateUsersOnApproval(existing, updated)

    expect(result.length).toBeGreaterThan(0)
  })
})
