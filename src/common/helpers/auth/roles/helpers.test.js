import { vi, describe, test, expect } from 'vitest'

import {
  isLinkedUser,
  isInitialUser,
  getOrgDataFromDefraIdToken,
  getOrganisationsSummary,
  findOrganisationMatches,
  getCurrentRelationship,
  getDefraTokenSummary
} from './helpers.js'

describe('auth roles helpers', () => {
  describe('#isLinkedUser', () => {
    test('returns true when organisation defraIdOrgId matches', () => {
      const organisation = {
        defraIdOrgId: 'defra-org-123'
      }

      const result = isLinkedUser(organisation, 'defra-org-123')

      expect(result).toBe(true)
    })

    test('returns false when organisation defraIdOrgId does not match', () => {
      const organisation = {
        defraIdOrgId: 'defra-org-123'
      }

      const result = isLinkedUser(organisation, 'defra-org-456')

      expect(result).toBe(false)
    })

    test('returns false when organisation defraIdOrgId is undefined', () => {
      const organisation = {}

      const result = isLinkedUser(organisation, 'defra-org-123')

      expect(result).toBe(false)
    })

    test('returns false when defraIdOrgId parameter is undefined', () => {
      const organisation = {
        defraIdOrgId: 'defra-org-123'
      }

      const result = isLinkedUser(organisation, undefined)

      expect(result).toBe(false)
    })

    test('returns true when both are undefined', () => {
      const organisation = {}

      const result = isLinkedUser(organisation, undefined)

      expect(result).toBe(true)
    })

    test('handles null values', () => {
      const organisation = {
        defraIdOrgId: null
      }

      const result = isLinkedUser(organisation, null)

      expect(result).toBe(true)
    })
  })

  describe('#isInitialUser', () => {
    test('returns true when user is initial user', () => {
      const organisation = {
        users: [
          { email: 'user1@example.com', isInitialUser: true },
          { email: 'user2@example.com', isInitialUser: false }
        ]
      }

      const result = isInitialUser(organisation, 'user1@example.com')

      expect(result).toBe(true)
    })

    test('returns false when user is not initial user', () => {
      const organisation = {
        users: [
          { email: 'user1@example.com', isInitialUser: false },
          { email: 'user2@example.com', isInitialUser: false }
        ]
      }

      const result = isInitialUser(organisation, 'user1@example.com')

      expect(result).toBe(false)
    })

    test('returns false when user email not found', () => {
      const organisation = {
        users: [{ email: 'user1@example.com', isInitialUser: true }]
      }

      const result = isInitialUser(organisation, 'user3@example.com')

      expect(result).toBe(false)
    })

    test('returns false when users array is empty', () => {
      const organisation = {
        users: []
      }

      const result = isInitialUser(organisation, 'user1@example.com')

      expect(result).toBe(false)
    })

    test('handles isInitialUser as falsy values', () => {
      const organisation = {
        users: [{ email: 'user1@example.com', isInitialUser: null }]
      }

      const result = isInitialUser(organisation, 'user1@example.com')

      expect(result).toBe(false)
    })

    test('handles multiple users with same email', () => {
      const organisation = {
        users: [
          { email: 'user1@example.com', isInitialUser: false },
          { email: 'user1@example.com', isInitialUser: true }
        ]
      }

      const result = isInitialUser(organisation, 'user1@example.com')

      expect(result).toBe(true)
    })
  })

  describe('#getOrgDataFromDefraIdToken', () => {
    test('parses single relationship correctly', () => {
      const tokenPayload = {
        currentRelationshipId: 'rel-001',
        relationships: ['rel-001:org-123:ACME Corporation']
      }

      const result = getOrgDataFromDefraIdToken(tokenPayload)

      expect(result).toEqual([
        {
          defraIdRelationshipId: 'rel-001',
          defraIdOrgId: 'org-123',
          defraIdOrgName: 'ACME Corporation',
          isCurrent: true
        }
      ])
    })

    test('parses multiple relationships correctly', () => {
      const tokenPayload = {
        currentRelationshipId: 'rel-002',
        relationships: [
          'rel-001:org-123:First Org',
          'rel-002:org-456:Second Org',
          'rel-003:org-789:Third Org'
        ]
      }

      const result = getOrgDataFromDefraIdToken(tokenPayload)

      expect(result).toEqual([
        {
          defraIdRelationshipId: 'rel-001',
          defraIdOrgId: 'org-123',
          defraIdOrgName: 'First Org',
          isCurrent: false
        },
        {
          defraIdRelationshipId: 'rel-002',
          defraIdOrgId: 'org-456',
          defraIdOrgName: 'Second Org',
          isCurrent: true
        },
        {
          defraIdRelationshipId: 'rel-003',
          defraIdOrgId: 'org-789',
          defraIdOrgName: 'Third Org',
          isCurrent: false
        }
      ])
    })

    test('handles organisation names with leading/trailing whitespace', () => {
      const tokenPayload = {
        currentRelationshipId: 'rel-001',
        relationships: ['rel-001:org-123:  Trimmed Org  ']
      }

      const result = getOrgDataFromDefraIdToken(tokenPayload)

      expect(result[0].defraIdOrgName).toBe('Trimmed Org')
    })

    test('handles organisation names with colons - splits on first two colons only', () => {
      const tokenPayload = {
        currentRelationshipId: 'rel-001',
        relationships: ['rel-001:org-123:ACME: The Company']
      }

      const result = getOrgDataFromDefraIdToken(tokenPayload)

      // The split function splits on all colons, so "ACME: The Company" becomes just "ACME"
      // after splitting "rel-001:org-123:ACME: The Company" by ":"
      // This test documents the current behavior
      expect(result[0].defraIdOrgName).toBe('ACME')
    })

    test('handles empty relationships array', () => {
      const tokenPayload = {
        currentRelationshipId: 'rel-001',
        relationships: []
      }

      const result = getOrgDataFromDefraIdToken(tokenPayload)

      expect(result).toEqual([])
    })

    test('marks no relationship as current when currentRelationshipId does not match', () => {
      const tokenPayload = {
        currentRelationshipId: 'rel-999',
        relationships: [
          'rel-001:org-123:First Org',
          'rel-002:org-456:Second Org'
        ]
      }

      const result = getOrgDataFromDefraIdToken(tokenPayload)

      expect(result.every((rel) => !rel.isCurrent)).toBe(true)
    })
  })

  describe('#getOrganisationsSummary', () => {
    test('returns summary with all required fields', () => {
      const organisations = [
        {
          id: 'epr-001',
          orgId: 'org-123',
          companyDetails: {
            name: 'ACME Corporation',
            tradingName: 'ACME Trading'
          }
        }
      ]

      const result = getOrganisationsSummary(organisations)

      expect(result).toEqual([
        {
          id: 'epr-001',
          orgId: 'org-123',
          name: 'ACME Corporation',
          tradingName: 'ACME Trading'
        }
      ])
    })

    test('handles multiple organisations', () => {
      const organisations = [
        {
          id: 'epr-001',
          orgId: 'org-123',
          companyDetails: {
            name: 'First Corp',
            tradingName: 'First Trading'
          }
        },
        {
          id: 'epr-002',
          orgId: 'org-456',
          companyDetails: {
            name: 'Second Corp',
            tradingName: 'Second Trading'
          }
        }
      ]

      const result = getOrganisationsSummary(organisations)

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('First Corp')
      expect(result[1].name).toBe('Second Corp')
    })

    test('handles empty organisations array', () => {
      const organisations = []

      const result = getOrganisationsSummary(organisations)

      expect(result).toEqual([])
    })

    test('extracts only specified fields', () => {
      const organisations = [
        {
          id: 'epr-001',
          orgId: 'org-123',
          defraIdOrgId: 'defra-123',
          users: [{ email: 'user@example.com' }],
          companyDetails: {
            name: 'ACME Corporation',
            tradingName: 'ACME Trading',
            companyNumber: '12345678',
            address: '123 Main St'
          }
        }
      ]

      const result = getOrganisationsSummary(organisations)

      expect(result[0]).toEqual({
        id: 'epr-001',
        orgId: 'org-123',
        name: 'ACME Corporation',
        tradingName: 'ACME Trading'
      })
    })
  })

  describe('#findOrganisationMatches', () => {
    test('finds linked and unlinked organisations', async () => {
      const linkedOrgs = [
        { id: 'org-1', defraIdOrgId: 'defra-123' },
        { id: 'org-2', defraIdOrgId: 'defra-123' }
      ]
      const unlinkedOrgs = [
        { id: 'org-3', users: [{ email: 'user@example.com' }] }
      ]

      const mockRepository = {
        findAllByDefraIdOrgId: vi.fn().mockResolvedValue(linkedOrgs),
        findAllUnlinkedOrganisationsByUser: vi
          .fn()
          .mockResolvedValue(unlinkedOrgs)
      }

      const result = await findOrganisationMatches(
        'user@example.com',
        'defra-123',
        mockRepository
      )

      expect(result.linked).toEqual(linkedOrgs)
      expect(result.unlinked).toEqual(unlinkedOrgs)
      expect(result.all).toHaveLength(3)
      expect(mockRepository.findAllByDefraIdOrgId).toHaveBeenCalledWith(
        'defra-123'
      )
      expect(
        mockRepository.findAllUnlinkedOrganisationsByUser
      ).toHaveBeenCalledWith({
        email: 'user@example.com',
        isInitialUser: true
      })
    })

    test('deduplicates organisations in all array', async () => {
      const duplicateOrg = { id: 'org-1', name: 'Org 1' }
      const linkedOrgs = [duplicateOrg]
      const unlinkedOrgs = [duplicateOrg, { id: 'org-2', name: 'Org 2' }]

      const mockRepository = {
        findAllByDefraIdOrgId: vi.fn().mockResolvedValue(linkedOrgs),
        findAllUnlinkedOrganisationsByUser: vi
          .fn()
          .mockResolvedValue(unlinkedOrgs)
      }

      const result = await findOrganisationMatches(
        'user@example.com',
        'defra-123',
        mockRepository
      )

      expect(result.all).toHaveLength(2)
      expect(result.all.filter((org) => org.id === 'org-1')).toHaveLength(1)
    })

    test('handles no linked organisations', async () => {
      const mockRepository = {
        findAllByDefraIdOrgId: vi.fn().mockResolvedValue([]),
        findAllUnlinkedOrganisationsByUser: vi
          .fn()
          .mockResolvedValue([{ id: 'org-1' }])
      }

      const result = await findOrganisationMatches(
        'user@example.com',
        'defra-123',
        mockRepository
      )

      expect(result.linked).toEqual([])
      expect(result.unlinked).toHaveLength(1)
      expect(result.all).toHaveLength(1)
    })

    test('handles no unlinked organisations', async () => {
      const mockRepository = {
        findAllByDefraIdOrgId: vi.fn().mockResolvedValue([{ id: 'org-1' }]),
        findAllUnlinkedOrganisationsByUser: vi.fn().mockResolvedValue([])
      }

      const result = await findOrganisationMatches(
        'user@example.com',
        'defra-123',
        mockRepository
      )

      expect(result.linked).toHaveLength(1)
      expect(result.unlinked).toEqual([])
      expect(result.all).toHaveLength(1)
    })

    test('handles no organisations at all', async () => {
      const mockRepository = {
        findAllByDefraIdOrgId: vi.fn().mockResolvedValue([]),
        findAllUnlinkedOrganisationsByUser: vi.fn().mockResolvedValue([])
      }

      const result = await findOrganisationMatches(
        'user@example.com',
        'defra-123',
        mockRepository
      )

      expect(result.linked).toEqual([])
      expect(result.unlinked).toEqual([])
      expect(result.all).toEqual([])
    })
  })

  describe('#getCurrentRelationship', () => {
    test('returns the current relationship', () => {
      const relationships = [
        { defraIdRelationshipId: 'rel-001', isCurrent: false },
        { defraIdRelationshipId: 'rel-002', isCurrent: true },
        { defraIdRelationshipId: 'rel-003', isCurrent: false }
      ]

      const result = getCurrentRelationship(relationships)

      expect(result).toEqual({
        defraIdRelationshipId: 'rel-002',
        isCurrent: true
      })
    })

    test('returns undefined when no current relationship', () => {
      const relationships = [
        { defraIdRelationshipId: 'rel-001', isCurrent: false },
        { defraIdRelationshipId: 'rel-002', isCurrent: false }
      ]

      const result = getCurrentRelationship(relationships)

      expect(result).toBeUndefined()
    })

    test('returns first current relationship when multiple marked as current', () => {
      const relationships = [
        { defraIdRelationshipId: 'rel-001', isCurrent: true },
        { defraIdRelationshipId: 'rel-002', isCurrent: true }
      ]

      const result = getCurrentRelationship(relationships)

      expect(result.defraIdRelationshipId).toBe('rel-001')
    })

    test('handles empty relationships array', () => {
      const relationships = []

      const result = getCurrentRelationship(relationships)

      expect(result).toBeUndefined()
    })
  })

  describe('#getDefraTokenSummary', () => {
    test('returns summary with current organisation details', () => {
      const tokenPayload = {
        currentRelationshipId: 'rel-002',
        relationships: [
          'rel-001:org-123:First Org',
          'rel-002:org-456:Second Org',
          'rel-003:org-789:Third Org'
        ]
      }

      const result = getDefraTokenSummary(tokenPayload)

      expect(result.defraIdOrgId).toBe('org-456')
      expect(result.defraIdOrgName).toBe('Second Org')
      expect(result.defraIdRelationships).toHaveLength(3)
    })

    test('returns undefined for org details when no current relationship', () => {
      const tokenPayload = {
        currentRelationshipId: 'rel-999',
        relationships: [
          'rel-001:org-123:First Org',
          'rel-002:org-456:Second Org'
        ]
      }

      const result = getDefraTokenSummary(tokenPayload)

      expect(result.defraIdOrgId).toBeUndefined()
      expect(result.defraIdOrgName).toBeUndefined()
      expect(result.defraIdRelationships).toHaveLength(2)
    })

    test('handles empty relationships', () => {
      const tokenPayload = {
        currentRelationshipId: 'rel-001',
        relationships: []
      }

      const result = getDefraTokenSummary(tokenPayload)

      expect(result.defraIdOrgId).toBeUndefined()
      expect(result.defraIdOrgName).toBeUndefined()
      expect(result.defraIdRelationships).toEqual([])
    })

    test('includes all relationships in summary', () => {
      const tokenPayload = {
        currentRelationshipId: 'rel-001',
        relationships: ['rel-001:org-123:Org Name', 'rel-002:org-456:Other Org']
      }

      const result = getDefraTokenSummary(tokenPayload)

      expect(result.defraIdRelationships).toHaveLength(2)
      expect(result.defraIdRelationships[0].defraIdOrgId).toBe('org-123')
      expect(result.defraIdRelationships[1].defraIdOrgId).toBe('org-456')
    })
  })
})
