import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { getDefraUserRoles } from './get-defra-user-roles.js'
import { SCOPES } from './constants.js'

const mockGetOrgMatchingUsersToken = vi.fn()
const mockGetDefraTokenSummary = vi.fn()

vi.mock('./roles/helpers.js', () => ({
  getDefraTokenSummary: (/** @type {any} */ ...args) =>
    mockGetDefraTokenSummary(...args)
}))

vi.mock('./get-users-org-info.js', () => ({
  getOrgMatchingUsersToken: (/** @type {any} */ ...args) =>
    mockGetOrgMatchingUsersToken(...args)
}))

/**
 *
 * @returns {import('#auth/types.js').DefraIdTokenPayload}
 */
function createTokenPayload(overrides = {}) {
  return {
    contactId: '',
    email: '',
    currentRelationshipId: '',
    relationships: [],
    firstName: '',
    lastName: '',
    iss: '',
    aud: '',
    exp: 0,
    iat: 0,
    ...overrides
  }
}

describe('#getDefraUserRoles', () => {
  const mockOrganisationsRepository = {}
  const mockRequest = /** @type {any} */ ({
    organisationsRepository: mockOrganisationsRepository,
    path: '/api/v1/organisations',
    method: 'get',
    params: {},
    server: {
      app: {}
    }
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('when email is missing', () => {
    test('returns empty array when email is undefined', async () => {
      const tokenPayload = /** @type {any} */ ({
        id: 'user-123'
        // email is undefined
      })

      const result = await getDefraUserRoles(tokenPayload, mockRequest)

      expect(result.scopes).toEqual([])
    })

    test('returns empty array when email is null', async () => {
      const tokenPayload = createTokenPayload({
        id: 'user-123',
        email: null
      })

      const result = await getDefraUserRoles(tokenPayload, mockRequest)

      expect(result.scopes).toEqual([])
    })

    test('returns empty array when email is empty string', async () => {
      const tokenPayload = createTokenPayload({
        id: 'user-123',
        email: ''
      })

      const result = await getDefraUserRoles(tokenPayload, mockRequest)

      expect(result.scopes).toEqual([])
    })
  })

  describe('when accessing a specific organisation', () => {
    const mockLinkedEprOrg = {
      id: 'org-123',
      name: 'Test Organisation',
      users: [{ email: 'user@example.com', roles: ['initial_user'] }],
      status: 'active'
    }

    const requestForOrg = {
      ...mockRequest,
      params: { organisationId: mockLinkedEprOrg.id }
    }

    const tokenPayload = createTokenPayload({
      id: 'user-123',
      email: 'user@example.com'
    })

    beforeEach(() => {
      mockGetOrgMatchingUsersToken.mockReset()
    })

    test('calls getOrgMatchingUsersToken with correct parameters', async () => {
      await getDefraUserRoles(tokenPayload, requestForOrg)

      expect(mockGetOrgMatchingUsersToken).toHaveBeenCalledWith(
        tokenPayload,
        mockOrganisationsRepository
      )
      expect(mockGetOrgMatchingUsersToken).toHaveBeenCalledTimes(1)
    })

    test('assigns standard user scope when user is linked to organisation specified in request, and organisation is active', async () => {
      mockGetOrgMatchingUsersToken.mockResolvedValue(mockLinkedEprOrg)

      const result = await getDefraUserRoles(tokenPayload, requestForOrg)

      expect(result.scopes).toEqual([
        SCOPES.organisationLinkedRead,
        SCOPES.organisationLinkedWrite,
        SCOPES.organisationRead,
        SCOPES.organisationWrite
      ])
    })

    test('does not assign standard user scope when user token is not linked to an organisation', async () => {
      mockGetOrgMatchingUsersToken.mockResolvedValue(null)

      const result = await getDefraUserRoles(tokenPayload, requestForOrg)

      expect(result.scopes).toEqual([
        SCOPES.organisationLinkedRead,
        SCOPES.organisationLinkedWrite
      ])
    })

    test('does not assign standard user scope when user is linked to a different organisation than the one being requested', async () => {
      mockGetOrgMatchingUsersToken.mockResolvedValue({
        ...mockLinkedEprOrg,
        id: 'another-org-id'
      })

      const result = await getDefraUserRoles(tokenPayload, requestForOrg)

      expect(result.scopes).toEqual([
        SCOPES.organisationLinkedRead,
        SCOPES.organisationLinkedWrite
      ])
    })

    test('does not assign standard user scope when user is linked to organisation specified in request, and organisation is not active', async () => {
      mockGetOrgMatchingUsersToken.mockResolvedValue({
        ...mockLinkedEprOrg,
        status: 'created'
      })

      const result = await getDefraUserRoles(tokenPayload, requestForOrg)

      expect(result.scopes).toEqual([
        SCOPES.organisationLinkedRead,
        SCOPES.organisationLinkedWrite
      ])
    })

    test('does not assign standard user scope when user is linked to an active organisation, but request does not specify an organisation', async () => {
      mockGetOrgMatchingUsersToken.mockResolvedValue(mockLinkedEprOrg)

      const result = await getDefraUserRoles(tokenPayload, {
        ...requestForOrg,
        params: {}
      })

      expect(result.scopes).toEqual([
        SCOPES.organisationLinkedRead,
        SCOPES.organisationLinkedWrite
      ])
    })
  })

  describe('error propagation', () => {
    test('propagates error from getOrgMatchingUsersToken', async () => {
      const error = new Error('Organisation not found')
      mockGetOrgMatchingUsersToken.mockRejectedValue(error)

      const tokenPayload = createTokenPayload({
        id: 'user-123',
        email: 'user@example.com'
      })

      await expect(
        getDefraUserRoles(tokenPayload, mockRequest)
      ).rejects.toThrow('Organisation not found')
    })
  })
})
