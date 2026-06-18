import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { getDefraUserRoles } from './get-defra-user-roles.js'
import { ROLES } from './constants.js'

const mockIsAuthorisedOrgLinkingReq = vi.fn()
const mockIsOrganisationsDiscoveryReq = vi.fn()
const mockGetOrgMatchingUsersToken = vi.fn()
const mockGetDefraTokenSummary = vi.fn()

vi.mock('./is-authorised-org-linking-req.js', () => ({
  isAuthorisedOrgLinkingReq: (/** @type {any} */ ...args) =>
    mockIsAuthorisedOrgLinkingReq(...args)
}))

vi.mock('./roles/helpers.js', () => ({
  isOrganisationsDiscoveryReq: (/** @type {any} */ ...args) =>
    mockIsOrganisationsDiscoveryReq(...args),
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
      expect(mockIsAuthorisedOrgLinkingReq).not.toHaveBeenCalled()
    })

    test('returns empty array when email is null', async () => {
      const tokenPayload = createTokenPayload({
        id: 'user-123',
        email: null
      })

      const result = await getDefraUserRoles(tokenPayload, mockRequest)

      expect(result.scopes).toEqual([])
      expect(mockIsAuthorisedOrgLinkingReq).not.toHaveBeenCalled()
    })

    test('returns empty array when email is empty string', async () => {
      const tokenPayload = createTokenPayload({
        id: 'user-123',
        email: ''
      })

      const result = await getDefraUserRoles(tokenPayload, mockRequest)

      expect(result.scopes).toEqual([])
      expect(mockIsAuthorisedOrgLinkingReq).not.toHaveBeenCalled()
    })
  })

  describe('when user is authorised for organisation linking', () => {
    beforeEach(() => {
      mockIsAuthorisedOrgLinkingReq.mockResolvedValue(true)
    })

    test('returns linker role when linking request is valid', async () => {
      const tokenPayload = createTokenPayload({
        id: 'user-123',
        email: 'user@example.com'
      })

      const result = await getDefraUserRoles(tokenPayload, mockRequest)

      expect(result.scopes).toEqual([ROLES.linker])
      expect(mockIsAuthorisedOrgLinkingReq).toHaveBeenCalledWith(
        mockRequest,
        tokenPayload
      )
      expect(mockIsAuthorisedOrgLinkingReq).toHaveBeenCalledTimes(1)
      expect(mockIsOrganisationsDiscoveryReq).not.toHaveBeenCalled()
    })

    test('calls isAuthorisedOrgLinkingReq with correct parameters', async () => {
      const tokenPayload = createTokenPayload({
        id: 'user-456',
        email: 'another@example.com'
      })
      const customRequest = {
        ...mockRequest,
        path: '/api/v1/organisations/link'
      }

      await getDefraUserRoles(tokenPayload, customRequest)

      expect(mockIsAuthorisedOrgLinkingReq).toHaveBeenCalledWith(
        customRequest,
        tokenPayload
      )
    })
  })

  describe('when request is an organisations discovery request', () => {
    beforeEach(() => {
      mockIsAuthorisedOrgLinkingReq.mockResolvedValue(false)
      mockIsOrganisationsDiscoveryReq.mockReturnValue(true)
    })

    test('returns inquirer role for discovery request', async () => {
      const tokenPayload = createTokenPayload({
        id: 'user-123',
        email: 'user@example.com'
      })

      const result = await getDefraUserRoles(tokenPayload, mockRequest)

      expect(result.scopes).toEqual([ROLES.inquirer])
      expect(mockIsOrganisationsDiscoveryReq).toHaveBeenCalledWith(mockRequest)
      expect(mockIsOrganisationsDiscoveryReq).toHaveBeenCalledTimes(1)
      expect(mockGetOrgMatchingUsersToken).not.toHaveBeenCalled()
    })

    test('calls isOrganisationsDiscoveryReq with correct request', async () => {
      const tokenPayload = createTokenPayload({
        id: 'user-456',
        email: 'another@example.com'
      })
      const customRequest = {
        ...mockRequest,
        path: '/api/v1/organisations/linked'
      }

      await getDefraUserRoles(tokenPayload, customRequest)

      expect(mockIsOrganisationsDiscoveryReq).toHaveBeenCalledWith(
        customRequest
      )
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
      mockIsAuthorisedOrgLinkingReq.mockResolvedValue(false)
      mockIsOrganisationsDiscoveryReq.mockReturnValue(false)
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

    test('returns single scope when user is linked to organisation specified in request, and organisation is active', async () => {
      mockGetOrgMatchingUsersToken.mockResolvedValue(mockLinkedEprOrg)

      const result = await getDefraUserRoles(tokenPayload, requestForOrg)

      expect(result.scopes).toEqual([ROLES.standardUser])
    })

    test('returns empty array of scopes when user token is not linked to an organisation', async () => {
      mockGetOrgMatchingUsersToken.mockResolvedValue(null)

      const result = await getDefraUserRoles(tokenPayload, requestForOrg)

      expect(result.scopes).toEqual([])
    })

    test('returns empty array of scopes when user is linked to a different organisation than the one being requested', async () => {
      mockGetOrgMatchingUsersToken.mockResolvedValue({
        ...mockLinkedEprOrg,
        id: 'another-org-id'
      })

      const result = await getDefraUserRoles(tokenPayload, requestForOrg)

      expect(result.scopes).toEqual([])
    })

    test('returns empty array of scopes when user is linked to organisation specified in request, and organisation is not active', async () => {
      mockGetOrgMatchingUsersToken.mockResolvedValue({
        ...mockLinkedEprOrg,
        status: 'created'
      })

      const result = await getDefraUserRoles(tokenPayload, requestForOrg)

      expect(result.scopes).toEqual([])
    })

    test('returns empty array of scopes when user is linked to an active organisation, but request does not specify an organisation', async () => {
      mockGetOrgMatchingUsersToken.mockResolvedValue(mockLinkedEprOrg)

      const result = await getDefraUserRoles(tokenPayload, {
        ...requestForOrg,
        params: {}
      })

      expect(result.scopes).toEqual([])
    })
  })

  describe('error propagation', () => {
    beforeEach(() => {
      mockIsAuthorisedOrgLinkingReq.mockResolvedValue(false)
      mockIsOrganisationsDiscoveryReq.mockReturnValue(false)
    })

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

    test('propagates error from isAuthorisedOrgLinkingReq', async () => {
      const error = new Error('Unauthorised linking request')
      mockIsAuthorisedOrgLinkingReq.mockRejectedValue(error)

      const tokenPayload = createTokenPayload({
        id: 'user-123',
        email: 'user@example.com'
      })

      await expect(
        getDefraUserRoles(tokenPayload, mockRequest)
      ).rejects.toThrow('Unauthorised linking request')
    })
  })

  describe('flow control', () => {
    test('short-circuits at email check before calling any other functions', async () => {
      const tokenPayload = createTokenPayload({
        id: 'user-123',
        email: ''
      })

      await getDefraUserRoles(tokenPayload, mockRequest)

      expect(mockIsAuthorisedOrgLinkingReq).not.toHaveBeenCalled()
      expect(mockIsOrganisationsDiscoveryReq).not.toHaveBeenCalled()
      expect(mockGetOrgMatchingUsersToken).not.toHaveBeenCalled()
    })

    test('short-circuits at linking check when valid linking request', async () => {
      mockIsAuthorisedOrgLinkingReq.mockResolvedValue(true)

      const tokenPayload = createTokenPayload({
        id: 'user-123',
        email: 'user@example.com'
      })

      await getDefraUserRoles(tokenPayload, mockRequest)

      expect(mockIsAuthorisedOrgLinkingReq).toHaveBeenCalledTimes(1)
      expect(mockIsOrganisationsDiscoveryReq).not.toHaveBeenCalled()
      expect(mockGetOrgMatchingUsersToken).not.toHaveBeenCalled()
    })

    test('short-circuits at discovery check when discovery request', async () => {
      mockIsAuthorisedOrgLinkingReq.mockResolvedValue(false)
      mockIsOrganisationsDiscoveryReq.mockReturnValue(true)

      const tokenPayload = createTokenPayload({
        id: 'user-123',
        email: 'user@example.com'
      })

      await getDefraUserRoles(tokenPayload, mockRequest)

      expect(mockIsAuthorisedOrgLinkingReq).toHaveBeenCalledTimes(1)
      expect(mockIsOrganisationsDiscoveryReq).toHaveBeenCalledTimes(1)
      expect(mockGetOrgMatchingUsersToken).not.toHaveBeenCalled()
    })

    test('executes full flow when accessing specific organisation', async () => {
      mockIsAuthorisedOrgLinkingReq.mockResolvedValue(false)
      mockIsOrganisationsDiscoveryReq.mockReturnValue(false)
      mockGetOrgMatchingUsersToken.mockResolvedValue({ id: 'org-123' })

      const tokenPayload = createTokenPayload({
        id: 'user-123',
        email: 'user@example.com'
      })

      await getDefraUserRoles(tokenPayload, mockRequest)

      expect(mockIsAuthorisedOrgLinkingReq).toHaveBeenCalledTimes(1)
      expect(mockIsOrganisationsDiscoveryReq).toHaveBeenCalledTimes(1)
      expect(mockGetOrgMatchingUsersToken).toHaveBeenCalledTimes(1)
    })
  })
})
