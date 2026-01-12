import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { getDefraUserRoles } from './get-defra-user-roles.js'
import { ROLES } from './constants.js'

const mockIsAuthorisedOrgLinkingReq = vi.fn()
const mockIsOrganisationsDiscoveryReq = vi.fn()
const mockGetOrgMatchingUsersToken = vi.fn()
const mockGetRolesForOrganisationAccess = vi.fn()
const mockGetDefraTokenSummary = vi.fn()

vi.mock('./is-authorised-org-linking-req.js', () => ({
  isAuthorisedOrgLinkingReq: (...args) => mockIsAuthorisedOrgLinkingReq(...args)
}))

vi.mock('./roles/helpers.js', () => ({
  isOrganisationsDiscoveryReq: (...args) =>
    mockIsOrganisationsDiscoveryReq(...args),
  getDefraTokenSummary: (...args) => mockGetDefraTokenSummary(...args)
}))

vi.mock('./get-users-org-info.js', () => ({
  getOrgMatchingUsersToken: (...args) => mockGetOrgMatchingUsersToken(...args)
}))

vi.mock('./get-roles-for-org-access.js', () => ({
  getRolesForOrganisationAccess: (...args) =>
    mockGetRolesForOrganisationAccess(...args)
}))

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

      expect(result).toEqual([])
      expect(mockIsAuthorisedOrgLinkingReq).not.toHaveBeenCalled()
    })

    test('returns empty array when email is null', async () => {
      const tokenPayload = {
        id: 'user-123',
        email: null
      }

      const result = await getDefraUserRoles(tokenPayload, mockRequest)

      expect(result).toEqual([])
      expect(mockIsAuthorisedOrgLinkingReq).not.toHaveBeenCalled()
    })

    test('returns empty array when email is empty string', async () => {
      const tokenPayload = {
        id: 'user-123',
        email: ''
      }

      const result = await getDefraUserRoles(tokenPayload, mockRequest)

      expect(result).toEqual([])
      expect(mockIsAuthorisedOrgLinkingReq).not.toHaveBeenCalled()
    })
  })

  describe('when user is authorised for organisation linking', () => {
    beforeEach(() => {
      mockIsAuthorisedOrgLinkingReq.mockResolvedValue(true)
    })

    test('returns linker role when linking request is valid', async () => {
      const tokenPayload = {
        id: 'user-123',
        email: 'user@example.com'
      }

      const result = await getDefraUserRoles(tokenPayload, mockRequest)

      expect(result).toEqual([ROLES.linker])
      expect(mockIsAuthorisedOrgLinkingReq).toHaveBeenCalledWith(
        mockRequest,
        tokenPayload
      )
      expect(mockIsAuthorisedOrgLinkingReq).toHaveBeenCalledTimes(1)
      expect(mockIsOrganisationsDiscoveryReq).not.toHaveBeenCalled()
    })

    test('calls isAuthorisedOrgLinkingReq with correct parameters', async () => {
      const tokenPayload = {
        id: 'user-456',
        email: 'another@example.com'
      }
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
      const tokenPayload = {
        id: 'user-123',
        email: 'user@example.com'
      }

      const result = await getDefraUserRoles(tokenPayload, mockRequest)

      expect(result).toEqual([ROLES.inquirer])
      expect(mockIsOrganisationsDiscoveryReq).toHaveBeenCalledWith(mockRequest)
      expect(mockIsOrganisationsDiscoveryReq).toHaveBeenCalledTimes(1)
      expect(mockGetOrgMatchingUsersToken).not.toHaveBeenCalled()
    })

    test('calls isOrganisationsDiscoveryReq with correct request', async () => {
      const tokenPayload = {
        id: 'user-456',
        email: 'another@example.com'
      }
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
      users: [{ email: 'user@example.com', roles: ['initial_user'] }]
    }

    beforeEach(() => {
      mockIsAuthorisedOrgLinkingReq.mockResolvedValue(false)
      mockIsOrganisationsDiscoveryReq.mockReturnValue(false)
      mockGetOrgMatchingUsersToken.mockResolvedValue(mockLinkedEprOrg)
    })

    test('returns roles for organisation access', async () => {
      const expectedRoles = [ROLES.editor, ROLES.viewer]
      mockGetRolesForOrganisationAccess.mockResolvedValue(expectedRoles)

      const tokenPayload = {
        id: 'user-123',
        email: 'user@example.com'
      }

      const result = await getDefraUserRoles(tokenPayload, mockRequest)

      expect(result).toEqual(expectedRoles)
      expect(mockGetOrgMatchingUsersToken).toHaveBeenCalledWith(
        tokenPayload,
        mockOrganisationsRepository
      )
      expect(mockGetRolesForOrganisationAccess).toHaveBeenCalledWith(
        mockRequest,
        mockLinkedEprOrg.id,
        tokenPayload
      )
    })

    test('calls getUsersOrganisationInfo with correct parameters', async () => {
      mockGetRolesForOrganisationAccess.mockResolvedValue([ROLES.viewer])

      const tokenPayload = {
        id: 'user-456',
        email: 'another@example.com'
      }

      await getDefraUserRoles(tokenPayload, mockRequest)

      expect(mockGetOrgMatchingUsersToken).toHaveBeenCalledWith(
        tokenPayload,
        mockOrganisationsRepository
      )
      expect(mockGetOrgMatchingUsersToken).toHaveBeenCalledTimes(1)
    })

    test('calls getRolesForOrganisationAccess with request and linked org', async () => {
      const customRoles = [ROLES.editor]
      mockGetRolesForOrganisationAccess.mockResolvedValue(customRoles)

      const tokenPayload = {
        id: 'user-789',
        email: 'third@example.com'
      }
      const customRequest = {
        ...mockRequest,
        params: { organisationId: 'org-123' }
      }

      await getDefraUserRoles(tokenPayload, customRequest)

      expect(mockGetRolesForOrganisationAccess).toHaveBeenCalledWith(
        customRequest,
        mockLinkedEprOrg.id,
        tokenPayload
      )
      expect(mockGetRolesForOrganisationAccess).toHaveBeenCalledTimes(1)
    })

    test('returns empty array when getRolesForOrganisationAccess returns empty', async () => {
      mockGetRolesForOrganisationAccess.mockResolvedValue([])

      const tokenPayload = {
        id: 'user-123',
        email: 'user@example.com'
      }

      const result = await getDefraUserRoles(tokenPayload, mockRequest)

      expect(result).toEqual([])
    })

    test('returns single role when user has one permission', async () => {
      mockGetRolesForOrganisationAccess.mockResolvedValue([ROLES.viewer])

      const tokenPayload = {
        id: 'user-123',
        email: 'user@example.com'
      }

      const result = await getDefraUserRoles(tokenPayload, mockRequest)

      expect(result).toEqual([ROLES.viewer])
    })

    test('returns multiple roles when user has multiple permissions', async () => {
      const multipleRoles = [ROLES.editor, ROLES.viewer, ROLES.admin]
      mockGetRolesForOrganisationAccess.mockResolvedValue(multipleRoles)

      const tokenPayload = {
        id: 'user-123',
        email: 'user@example.com'
      }

      const result = await getDefraUserRoles(tokenPayload, mockRequest)

      expect(result).toEqual(multipleRoles)
    })
  })

  describe('when user is not linked to any organisation', () => {
    beforeEach(() => {
      mockIsAuthorisedOrgLinkingReq.mockResolvedValue(false)
      mockIsOrganisationsDiscoveryReq.mockReturnValue(false)
      mockGetOrgMatchingUsersToken.mockResolvedValue(null)
    })

    test('throws forbidden error when user token is not linked to an organisation', async () => {
      const tokenPayload = {
        id: 'user-123',
        email: 'user@example.com'
      }

      try {
        await getDefraUserRoles(tokenPayload, mockRequest)
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error.isBoom).toBe(true)
        expect(error.output.statusCode).toBe(403)
        expect(error.message).toBe('User is not linked to an organisation')
      }
    })

    test('does not call getRolesForOrganisationAccess', async () => {
      const tokenPayload = {
        id: 'user-123',
        email: 'user@example.com'
      }

      try {
        await getDefraUserRoles(tokenPayload, mockRequest)
      } catch {
        // Expected to throw
      }

      expect(mockGetRolesForOrganisationAccess).not.toHaveBeenCalled()
    })
  })

  describe('error propagation', () => {
    beforeEach(() => {
      mockIsAuthorisedOrgLinkingReq.mockResolvedValue(false)
      mockIsOrganisationsDiscoveryReq.mockReturnValue(false)
    })

    test('propagates error from getUsersOrganisationInfo', async () => {
      const error = new Error('Organisation not found')
      mockGetOrgMatchingUsersToken.mockRejectedValue(error)

      const tokenPayload = {
        id: 'user-123',
        email: 'user@example.com'
      }

      await expect(
        getDefraUserRoles(tokenPayload, mockRequest)
      ).rejects.toThrow('Organisation not found')
    })

    test('propagates error from getRolesForOrganisationAccess', async () => {
      const error = new Error('Access denied')
      mockGetOrgMatchingUsersToken.mockResolvedValue({ id: 'org-123' })
      mockGetRolesForOrganisationAccess.mockRejectedValue(error)

      const tokenPayload = {
        id: 'user-123',
        email: 'user@example.com'
      }

      await expect(
        getDefraUserRoles(tokenPayload, mockRequest)
      ).rejects.toThrow('Access denied')
    })

    test('propagates error from isAuthorisedOrgLinkingReq', async () => {
      const error = new Error('Unauthorised linking request')
      mockIsAuthorisedOrgLinkingReq.mockRejectedValue(error)

      const tokenPayload = {
        id: 'user-123',
        email: 'user@example.com'
      }

      await expect(
        getDefraUserRoles(tokenPayload, mockRequest)
      ).rejects.toThrow('Unauthorised linking request')
    })
  })

  describe('flow control', () => {
    test('short-circuits at email check before calling any other functions', async () => {
      const tokenPayload = {
        id: 'user-123',
        email: ''
      }

      await getDefraUserRoles(tokenPayload, mockRequest)

      expect(mockIsAuthorisedOrgLinkingReq).not.toHaveBeenCalled()
      expect(mockIsOrganisationsDiscoveryReq).not.toHaveBeenCalled()
      expect(mockGetOrgMatchingUsersToken).not.toHaveBeenCalled()
      expect(mockGetRolesForOrganisationAccess).not.toHaveBeenCalled()
    })

    test('short-circuits at linking check when valid linking request', async () => {
      mockIsAuthorisedOrgLinkingReq.mockResolvedValue(true)

      const tokenPayload = {
        id: 'user-123',
        email: 'user@example.com'
      }

      await getDefraUserRoles(tokenPayload, mockRequest)

      expect(mockIsAuthorisedOrgLinkingReq).toHaveBeenCalledTimes(1)
      expect(mockIsOrganisationsDiscoveryReq).not.toHaveBeenCalled()
      expect(mockGetOrgMatchingUsersToken).not.toHaveBeenCalled()
      expect(mockGetRolesForOrganisationAccess).not.toHaveBeenCalled()
    })

    test('short-circuits at discovery check when discovery request', async () => {
      mockIsAuthorisedOrgLinkingReq.mockResolvedValue(false)
      mockIsOrganisationsDiscoveryReq.mockReturnValue(true)

      const tokenPayload = {
        id: 'user-123',
        email: 'user@example.com'
      }

      await getDefraUserRoles(tokenPayload, mockRequest)

      expect(mockIsAuthorisedOrgLinkingReq).toHaveBeenCalledTimes(1)
      expect(mockIsOrganisationsDiscoveryReq).toHaveBeenCalledTimes(1)
      expect(mockGetOrgMatchingUsersToken).not.toHaveBeenCalled()
      expect(mockGetRolesForOrganisationAccess).not.toHaveBeenCalled()
    })

    test('executes full flow when accessing specific organisation', async () => {
      mockIsAuthorisedOrgLinkingReq.mockResolvedValue(false)
      mockIsOrganisationsDiscoveryReq.mockReturnValue(false)
      mockGetOrgMatchingUsersToken.mockResolvedValue({ id: 'org-123' })
      mockGetRolesForOrganisationAccess.mockResolvedValue([ROLES.viewer])

      const tokenPayload = {
        id: 'user-123',
        email: 'user@example.com'
      }

      await getDefraUserRoles(tokenPayload, mockRequest)

      expect(mockIsAuthorisedOrgLinkingReq).toHaveBeenCalledTimes(1)
      expect(mockIsOrganisationsDiscoveryReq).toHaveBeenCalledTimes(1)
      expect(mockGetOrgMatchingUsersToken).toHaveBeenCalledTimes(1)
      expect(mockGetRolesForOrganisationAccess).toHaveBeenCalledTimes(1)
    })
  })
})
