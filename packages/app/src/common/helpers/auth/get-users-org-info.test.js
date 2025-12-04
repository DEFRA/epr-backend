import { vi, describe, test, expect, beforeEach } from 'vitest'
import Boom from '@hapi/boom'
import { getUsersOrganisationInfo } from './get-users-org-info.js'

// Mock the dependencies
const mockGetDefraTokenSummary = vi.fn()
const mockFindOrganisationMatches = vi.fn()

vi.mock('#common/helpers/auth/roles/helpers.js', () => ({
  getDefraTokenSummary: (...args) => mockGetDefraTokenSummary(...args),
  findOrganisationMatches: (...args) => mockFindOrganisationMatches(...args)
}))

describe('#getUsersOrganisationInfo', () => {
  let mockOrganisationsRepository
  let mockTokenPayload

  beforeEach(() => {
    vi.clearAllMocks()

    mockOrganisationsRepository = {
      findOne: vi.fn(),
      findMany: vi.fn()
    }

    mockTokenPayload = {
      id: 'user-id-123',
      email: 'user@example.com',
      currentRelationshipId: 'rel-1',
      relationships: ['rel-1:org-1:Organisation One']
    }
  })

  describe('happy path', () => {
    test('returns linked EPR org and all user orgs when single linked org exists', async () => {
      const mockLinkedOrg = {
        id: 'epr-org-id-1',
        name: 'EPR Organisation One',
        defraIdOrgId: 'org-1'
      }

      const mockUserOrgs = [mockLinkedOrg]

      mockGetDefraTokenSummary.mockReturnValue({
        defraIdOrgId: 'org-1',
        defraIdOrgName: 'Organisation One'
      })

      mockFindOrganisationMatches.mockResolvedValue({
        all: mockUserOrgs,
        linked: [mockLinkedOrg],
        unlinked: []
      })

      const result = await getUsersOrganisationInfo(
        mockTokenPayload,
        mockOrganisationsRepository
      )

      expect(result).toEqual({
        linkedEprOrg: mockLinkedOrg,
        userOrgs: mockUserOrgs
      })
    })

    test('returns undefined linkedEprOrg when no linked orgs exist', async () => {
      const mockUnlinkedOrg = {
        id: 'epr-org-id-1',
        name: 'EPR Organisation One'
      }

      const mockUserOrgs = [mockUnlinkedOrg]

      mockGetDefraTokenSummary.mockReturnValue({
        defraIdOrgId: 'org-1',
        defraIdOrgName: 'Organisation One'
      })

      mockFindOrganisationMatches.mockResolvedValue({
        all: mockUserOrgs,
        linked: [],
        unlinked: [mockUnlinkedOrg]
      })

      const result = await getUsersOrganisationInfo(
        mockTokenPayload,
        mockOrganisationsRepository
      )

      expect(result).toEqual({
        linkedEprOrg: undefined,
        userOrgs: mockUserOrgs
      })
    })

    test('calls getDefraTokenSummary with token payload', async () => {
      mockGetDefraTokenSummary.mockReturnValue({
        defraIdOrgId: 'org-1',
        defraIdOrgName: 'Organisation One'
      })

      mockFindOrganisationMatches.mockResolvedValue({
        all: [],
        linked: [],
        unlinked: []
      })

      await getUsersOrganisationInfo(
        mockTokenPayload,
        mockOrganisationsRepository
      )

      expect(mockGetDefraTokenSummary).toHaveBeenCalledWith(mockTokenPayload)
      expect(mockGetDefraTokenSummary).toHaveBeenCalledTimes(1)
    })

    test('calls findOrganisationMatches with correct parameters', async () => {
      mockGetDefraTokenSummary.mockReturnValue({
        defraIdOrgId: 'org-1',
        defraIdOrgName: 'Organisation One'
      })

      mockFindOrganisationMatches.mockResolvedValue({
        all: [],
        linked: [],
        unlinked: []
      })

      await getUsersOrganisationInfo(
        mockTokenPayload,
        mockOrganisationsRepository
      )

      expect(mockFindOrganisationMatches).toHaveBeenCalledWith(
        'user@example.com',
        'org-1',
        mockOrganisationsRepository
      )
      expect(mockFindOrganisationMatches).toHaveBeenCalledTimes(1)
    })
  })

  describe('error cases', () => {
    test('throws forbidden error when multiple linked organisations exist', async () => {
      const mockLinkedOrg1 = {
        id: 'epr-org-id-1',
        name: 'EPR Organisation One',
        defraIdOrgId: 'org-1'
      }

      const mockLinkedOrg2 = {
        id: 'epr-org-id-2',
        name: 'EPR Organisation Two',
        defraIdOrgId: 'org-1'
      }

      mockGetDefraTokenSummary.mockReturnValue({
        defraIdOrgId: 'org-1',
        defraIdOrgName: 'Organisation One'
      })

      mockFindOrganisationMatches.mockResolvedValue({
        all: [mockLinkedOrg1, mockLinkedOrg2],
        linked: [mockLinkedOrg1, mockLinkedOrg2],
        unlinked: []
      })

      await expect(
        getUsersOrganisationInfo(mockTokenPayload, mockOrganisationsRepository)
      ).rejects.toThrow(
        Boom.forbidden(
          'defra-id: multiple organisations linked to the user token'
        )
      )
    })

    test('throws forbidden error with correct message for multiple linked orgs', async () => {
      const mockLinkedOrg1 = { id: 'epr-org-id-1', name: 'Org One' }
      const mockLinkedOrg2 = { id: 'epr-org-id-2', name: 'Org Two' }
      const mockLinkedOrg3 = { id: 'epr-org-id-3', name: 'Org Three' }

      mockGetDefraTokenSummary.mockReturnValue({
        defraIdOrgId: 'org-1',
        defraIdOrgName: 'Organisation One'
      })

      mockFindOrganisationMatches.mockResolvedValue({
        all: [mockLinkedOrg1, mockLinkedOrg2, mockLinkedOrg3],
        linked: [mockLinkedOrg1, mockLinkedOrg2, mockLinkedOrg3],
        unlinked: []
      })

      try {
        await getUsersOrganisationInfo(
          mockTokenPayload,
          mockOrganisationsRepository
        )
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.isBoom).toBe(true)
        expect(error.output.statusCode).toBe(403)
        expect(error.message).toBe(
          'defra-id: multiple organisations linked to the user token'
        )
      }
    })
  })

  describe('edge cases', () => {
    test('handles empty all array', async () => {
      mockGetDefraTokenSummary.mockReturnValue({
        defraIdOrgId: 'org-1',
        defraIdOrgName: 'Organisation One'
      })

      mockFindOrganisationMatches.mockResolvedValue({
        all: [],
        linked: [],
        unlinked: []
      })

      const result = await getUsersOrganisationInfo(
        mockTokenPayload,
        mockOrganisationsRepository
      )

      expect(result).toEqual({
        linkedEprOrg: undefined,
        userOrgs: []
      })
    })

    test('handles token payload without defraIdOrgId', async () => {
      mockGetDefraTokenSummary.mockReturnValue({
        defraIdOrgId: undefined,
        defraIdOrgName: undefined
      })

      mockFindOrganisationMatches.mockResolvedValue({
        all: [],
        linked: [],
        unlinked: []
      })

      const result = await getUsersOrganisationInfo(
        mockTokenPayload,
        mockOrganisationsRepository
      )

      expect(mockFindOrganisationMatches).toHaveBeenCalledWith(
        'user@example.com',
        undefined,
        mockOrganisationsRepository
      )
      expect(result.linkedEprOrg).toBeUndefined()
    })

    test('handles mixed linked and unlinked organisations', async () => {
      const mockLinkedOrg = { id: 'epr-org-id-1', name: 'Linked Org' }
      const mockUnlinkedOrg1 = { id: 'epr-org-id-2', name: 'Unlinked Org 1' }
      const mockUnlinkedOrg2 = { id: 'epr-org-id-3', name: 'Unlinked Org 2' }

      mockGetDefraTokenSummary.mockReturnValue({
        defraIdOrgId: 'org-1',
        defraIdOrgName: 'Organisation One'
      })

      mockFindOrganisationMatches.mockResolvedValue({
        all: [mockLinkedOrg, mockUnlinkedOrg1, mockUnlinkedOrg2],
        linked: [mockLinkedOrg],
        unlinked: [mockUnlinkedOrg1, mockUnlinkedOrg2]
      })

      const result = await getUsersOrganisationInfo(
        mockTokenPayload,
        mockOrganisationsRepository
      )

      expect(result).toEqual({
        linkedEprOrg: mockLinkedOrg,
        userOrgs: [mockLinkedOrg, mockUnlinkedOrg1, mockUnlinkedOrg2]
      })
    })
  })

  describe('integration with helper functions', () => {
    test('passes email from token payload to findOrganisationMatches', async () => {
      const customTokenPayload = {
        ...mockTokenPayload,
        email: 'custom@example.com'
      }

      mockGetDefraTokenSummary.mockReturnValue({
        defraIdOrgId: 'org-1',
        defraIdOrgName: 'Organisation One'
      })

      mockFindOrganisationMatches.mockResolvedValue({
        all: [],
        linked: [],
        unlinked: []
      })

      await getUsersOrganisationInfo(
        customTokenPayload,
        mockOrganisationsRepository
      )

      expect(mockFindOrganisationMatches).toHaveBeenCalledWith(
        'custom@example.com',
        'org-1',
        mockOrganisationsRepository
      )
    })

    test('uses defraIdOrgId from getDefraTokenSummary result', async () => {
      const customDefraIdOrgId = 'custom-defra-org-id'

      mockGetDefraTokenSummary.mockReturnValue({
        defraIdOrgId: customDefraIdOrgId,
        defraIdOrgName: 'Custom Organisation'
      })

      mockFindOrganisationMatches.mockResolvedValue({
        all: [],
        linked: [],
        unlinked: []
      })

      await getUsersOrganisationInfo(
        mockTokenPayload,
        mockOrganisationsRepository
      )

      expect(mockFindOrganisationMatches).toHaveBeenCalledWith(
        'user@example.com',
        customDefraIdOrgId,
        mockOrganisationsRepository
      )
    })
  })
})
