import { vi, describe, test, expect, beforeEach } from 'vitest'
import Boom from '@hapi/boom'

import { getUsersOrganisationInfo } from './get-users-org-info.js'

// Mock the helpers module
const mockGetDefraTokenSummary = vi.fn()
const mockFindOrganisationMatches = vi.fn()

vi.mock('#common/helpers/auth/roles/helpers.js', () => ({
  getDefraTokenSummary: (...args) => mockGetDefraTokenSummary(...args),
  findOrganisationMatches: (...args) => mockFindOrganisationMatches(...args)
}))

describe('#getUsersOrganisationInfo', () => {
  let mockOrganisationsRepository

  beforeEach(() => {
    vi.clearAllMocks()

    mockOrganisationsRepository = {
      findAllByDefraIdOrgId: vi.fn(),
      findAllUnlinkedOrganisationsByUser: vi.fn()
    }
  })

  describe('successful scenarios', () => {
    test('returns linkedEprOrg and userOrgs when single organisation linked', async () => {
      const tokenPayload = {
        email: 'user@example.com',
        currentRelationshipId: 'rel-001',
        relationships: ['rel-001:org-123:Test Org']
      }

      mockGetDefraTokenSummary.mockReturnValue({
        defraIdOrgId: 'org-123',
        defraIdOrgName: 'Test Org'
      })

      const linkedOrg = { id: 'epr-001', defraIdOrgId: 'org-123' }
      mockFindOrganisationMatches.mockResolvedValue({
        linked: [linkedOrg],
        all: [linkedOrg]
      })

      const result = await getUsersOrganisationInfo(
        tokenPayload,
        mockOrganisationsRepository
      )

      expect(result).toEqual({
        linkedEprOrg: linkedOrg,
        userOrgs: [linkedOrg]
      })
      expect(mockGetDefraTokenSummary).toHaveBeenCalledWith(tokenPayload)
      expect(mockFindOrganisationMatches).toHaveBeenCalledWith(
        'user@example.com',
        'org-123',
        mockOrganisationsRepository
      )
    })

    test('returns undefined linkedEprOrg when no organisations linked', async () => {
      const tokenPayload = {
        email: 'user@example.com',
        currentRelationshipId: 'rel-001',
        relationships: ['rel-001:org-123:Test Org']
      }

      mockGetDefraTokenSummary.mockReturnValue({
        defraIdOrgId: 'org-123'
      })

      const unlinkedOrg = { id: 'epr-002' }
      mockFindOrganisationMatches.mockResolvedValue({
        linked: [],
        all: [unlinkedOrg]
      })

      const result = await getUsersOrganisationInfo(
        tokenPayload,
        mockOrganisationsRepository
      )

      expect(result).toEqual({
        linkedEprOrg: undefined,
        userOrgs: [unlinkedOrg]
      })
    })

    test('calls repository methods through findOrganisationMatches', async () => {
      const tokenPayload = {
        email: 'test@example.com',
        currentRelationshipId: 'rel-001',
        relationships: ['rel-001:org-456:Company']
      }

      mockGetDefraTokenSummary.mockReturnValue({
        defraIdOrgId: 'org-456'
      })

      mockFindOrganisationMatches.mockResolvedValue({
        linked: [],
        all: []
      })

      await getUsersOrganisationInfo(tokenPayload, mockOrganisationsRepository)

      expect(mockFindOrganisationMatches).toHaveBeenCalledWith(
        'test@example.com',
        'org-456',
        mockOrganisationsRepository
      )
    })
  })

  describe('error scenarios', () => {
    test('throws forbidden when defraIdOrgId is not found in token', async () => {
      const tokenPayload = {
        email: 'user@example.com',
        currentRelationshipId: 'rel-001',
        relationships: []
      }

      mockGetDefraTokenSummary.mockReturnValue({
        defraIdOrgId: undefined
      })

      await expect(
        getUsersOrganisationInfo(tokenPayload, mockOrganisationsRepository)
      ).rejects.toThrow(
        Boom.forbidden('defra-id: defraIdOrgId not found in token')
      )
    })

    test('throws forbidden when defraIdOrgId is null', async () => {
      const tokenPayload = {
        email: 'user@example.com',
        currentRelationshipId: 'rel-999',
        relationships: ['rel-001:org-123:Test Org']
      }

      mockGetDefraTokenSummary.mockReturnValue({
        defraIdOrgId: null
      })

      await expect(
        getUsersOrganisationInfo(tokenPayload, mockOrganisationsRepository)
      ).rejects.toThrow(
        Boom.forbidden('defra-id: defraIdOrgId not found in token')
      )
    })

    test('throws forbidden when multiple organisations are linked', async () => {
      const tokenPayload = {
        email: 'user@example.com',
        currentRelationshipId: 'rel-001',
        relationships: ['rel-001:org-123:Test Org']
      }

      mockGetDefraTokenSummary.mockReturnValue({
        defraIdOrgId: 'org-123'
      })

      const linkedOrgs = [
        { id: 'epr-001', defraIdOrgId: 'org-123' },
        { id: 'epr-002', defraIdOrgId: 'org-123' }
      ]
      mockFindOrganisationMatches.mockResolvedValue({
        linked: linkedOrgs,
        all: linkedOrgs
      })

      await expect(
        getUsersOrganisationInfo(tokenPayload, mockOrganisationsRepository)
      ).rejects.toThrow(
        Boom.forbidden(
          'defra-id: multiple organisations linked to the user token'
        )
      )
    })

    test('throws forbidden when more than two organisations are linked', async () => {
      const tokenPayload = {
        email: 'user@example.com',
        currentRelationshipId: 'rel-001',
        relationships: ['rel-001:org-123:Test Org']
      }

      mockGetDefraTokenSummary.mockReturnValue({
        defraIdOrgId: 'org-123'
      })

      const linkedOrgs = [
        { id: 'epr-001', defraIdOrgId: 'org-123' },
        { id: 'epr-002', defraIdOrgId: 'org-123' },
        { id: 'epr-003', defraIdOrgId: 'org-123' }
      ]
      mockFindOrganisationMatches.mockResolvedValue({
        linked: linkedOrgs,
        all: linkedOrgs
      })

      await expect(
        getUsersOrganisationInfo(tokenPayload, mockOrganisationsRepository)
      ).rejects.toThrow(
        Boom.forbidden(
          'defra-id: multiple organisations linked to the user token'
        )
      )
    })
  })

  describe('edge cases', () => {
    test('handles token payload with empty email', async () => {
      const tokenPayload = {
        email: '',
        currentRelationshipId: 'rel-001',
        relationships: ['rel-001:org-123:Test Org']
      }

      mockGetDefraTokenSummary.mockReturnValue({
        defraIdOrgId: 'org-123'
      })

      mockFindOrganisationMatches.mockResolvedValue({
        linked: [{ id: 'epr-001' }],
        all: [{ id: 'epr-001' }]
      })

      await getUsersOrganisationInfo(tokenPayload, mockOrganisationsRepository)

      expect(mockFindOrganisationMatches).toHaveBeenCalledWith(
        '',
        'org-123',
        mockOrganisationsRepository
      )
    })

    test('handles userOrgs containing both linked and unlinked organisations', async () => {
      const tokenPayload = {
        email: 'user@example.com',
        currentRelationshipId: 'rel-001',
        relationships: ['rel-001:org-123:Test Org']
      }

      mockGetDefraTokenSummary.mockReturnValue({
        defraIdOrgId: 'org-123'
      })

      const linkedOrg = { id: 'epr-001', defraIdOrgId: 'org-123' }
      const unlinkedOrg = { id: 'epr-002' }
      mockFindOrganisationMatches.mockResolvedValue({
        linked: [linkedOrg],
        all: [unlinkedOrg, linkedOrg]
      })

      const result = await getUsersOrganisationInfo(
        tokenPayload,
        mockOrganisationsRepository
      )

      expect(result.userOrgs).toHaveLength(2)
      expect(result.linkedEprOrg).toEqual(linkedOrg)
    })

    test('returns first organisation when exactly one is linked', async () => {
      const tokenPayload = {
        email: 'user@example.com',
        currentRelationshipId: 'rel-001',
        relationships: ['rel-001:org-123:Test Org']
      }

      mockGetDefraTokenSummary.mockReturnValue({
        defraIdOrgId: 'org-123'
      })

      const linkedOrg = {
        id: 'epr-001',
        defraIdOrgId: 'org-123',
        name: 'First'
      }
      mockFindOrganisationMatches.mockResolvedValue({
        linked: [linkedOrg],
        all: [linkedOrg]
      })

      const result = await getUsersOrganisationInfo(
        tokenPayload,
        mockOrganisationsRepository
      )

      expect(result.linkedEprOrg).toBe(linkedOrg)
    })

    test('handles complex organisation structures', async () => {
      const tokenPayload = {
        email: 'user@example.com',
        currentRelationshipId: 'rel-001',
        relationships: ['rel-001:org-123:Test Org']
      }

      mockGetDefraTokenSummary.mockReturnValue({
        defraIdOrgId: 'org-123'
      })

      const linkedOrg = {
        id: 'epr-001',
        orgId: 'ORG123',
        defraIdOrgId: 'org-123',
        companyDetails: {
          name: 'Test Company',
          tradingName: 'Test Trading'
        },
        users: [{ email: 'user@example.com', isInitialUser: true }]
      }
      mockFindOrganisationMatches.mockResolvedValue({
        linked: [linkedOrg],
        all: [linkedOrg]
      })

      const result = await getUsersOrganisationInfo(
        tokenPayload,
        mockOrganisationsRepository
      )

      expect(result.linkedEprOrg).toEqual(linkedOrg)
      expect(result.userOrgs).toEqual([linkedOrg])
    })
  })

  describe('integration with helper functions', () => {
    test('passes email from token payload to findOrganisationMatches', async () => {
      const tokenPayload = {
        email: 'specific@example.com',
        currentRelationshipId: 'rel-001',
        relationships: ['rel-001:org-123:Test Org']
      }

      mockGetDefraTokenSummary.mockReturnValue({
        defraIdOrgId: 'org-123'
      })

      mockFindOrganisationMatches.mockResolvedValue({
        linked: [],
        all: []
      })

      await getUsersOrganisationInfo(tokenPayload, mockOrganisationsRepository)

      expect(mockFindOrganisationMatches).toHaveBeenCalledWith(
        'specific@example.com',
        'org-123',
        mockOrganisationsRepository
      )
    })

    test('uses defraIdOrgId from getDefraTokenSummary result', async () => {
      const tokenPayload = {
        email: 'user@example.com',
        currentRelationshipId: 'rel-001',
        relationships: ['rel-001:custom-org-id:Test Org']
      }

      mockGetDefraTokenSummary.mockReturnValue({
        defraIdOrgId: 'custom-org-id'
      })

      mockFindOrganisationMatches.mockResolvedValue({
        linked: [],
        all: []
      })

      await getUsersOrganisationInfo(tokenPayload, mockOrganisationsRepository)

      expect(mockFindOrganisationMatches).toHaveBeenCalledWith(
        'user@example.com',
        'custom-org-id',
        mockOrganisationsRepository
      )
    })
  })
})
