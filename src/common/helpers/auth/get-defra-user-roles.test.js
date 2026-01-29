import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { getDefraUserRoles } from './get-defra-user-roles.js'
import { ROLES } from './constants.js'

const mockGetDefraTokenSummary = vi.fn()
const mockIsInitialUser = vi.fn()

vi.mock('./roles/helpers.js', async (importOriginal) => ({
  ...(await importOriginal()),
  isInitialUser: (...args) => mockIsInitialUser(...args),
  getDefraTokenSummary: (...args) => mockGetDefraTokenSummary(...args)
}))

describe('#getDefraUserRoles', () => {
  const validTokenPayload = {
    contactId: 'id-123',
    email: 'user@example.com',
    firstName: 'John',
    lastName: 'D',
    iss: 'iss-vaue',
    aud: 'aud-value',
    exp: 123,
    iat: 456
  }

  const mockOrganisationsRepository = {
    findById: vi.fn(),
    replace: vi.fn()
  }
  const mockRequest = /** @type {any} */ ({
    organisationsRepository: mockOrganisationsRepository,
    path: '/api/v1/organisations',
    method: 'get',
    params: {},
    server: {
      app: {}
    },
    logger: {
      warn: vi.fn()
    }
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe(`assigning inquirer role`, () => {
    test('assigned when email is present in token', async () => {
      const result = await getDefraUserRoles(validTokenPayload, mockRequest)

      expect(result).toContain(ROLES.inquirer)
    })

    it.each([{ email: null }, { email: undefined }, { email: '' }])(
      'not assigned when email in token is $email',
      async ({ email }) => {
        const tokenPayload = {
          ...validTokenPayload,
          email
        }

        const result = await getDefraUserRoles(tokenPayload, mockRequest)

        expect(result).not.toContain(ROLES.inquirer)
      }
    )
  })

  describe(`assigning linker role`, () => {
    beforeEach(() => {
      mockIsInitialUser.mockReturnValue(true)
      mockOrganisationsRepository.findById.mockResolvedValue({ id: 'org-123' })
      mockGetDefraTokenSummary.mockReturnValue({
        defraIdOrgId: 'defra-org-123'
      })
    })

    test('assigned when user is an initial user for the organisation', async () => {
      const request = {
        ...mockRequest,
        params: { organisationId: 'org-123' }
      }

      const result = await getDefraUserRoles(validTokenPayload, request)

      expect(result).toContain(ROLES.linker)
    })

    it.each([
      { organisationId: null },
      { organisationId: undefined },
      { organisationId: '' }
    ])(
      'is not assigned when request does not specify an organisationId',
      async ({ organisationId }) => {
        const request = {
          ...mockRequest,
          params: { organisationId }
        }

        const result = await getDefraUserRoles(validTokenPayload, request)

        expect(result).not.toContain(ROLES.linker)
      }
    )

    test('is not assigned when organisation does not exist', async () => {
      const request = {
        ...mockRequest,
        params: { organisationId: 'org-123' }
      }

      mockOrganisationsRepository.findById.mockRejectedValue(
        new Error('Organisation not found')
      )

      const result = await getDefraUserRoles(validTokenPayload, request)

      expect(result).not.toContain(ROLES.linker)
    })

    test('is not assigned when user is not an initial user', async () => {
      const request = {
        ...mockRequest,
        params: { organisationId: 'org-123' }
      }

      mockIsInitialUser.mockReturnValue(false)

      const result = await getDefraUserRoles(validTokenPayload, request)

      expect(result).not.toContain(ROLES.linker)
    })
  })

  describe(`assigning standard user role`, () => {
    beforeEach(() => {
      mockIsInitialUser.mockReturnValue(true)
      mockOrganisationsRepository.findById.mockResolvedValue({
        id: 'org-123',
        linkedDefraOrganisation: { orgId: 'defra-org-123' },
        status: 'active'
      })
      mockGetDefraTokenSummary.mockReturnValue({
        defraIdOrgId: 'defra-org-123'
      })
    })

    test('assigned when organisation is linked to users Defra org and status is accessible', async () => {
      const request = {
        ...mockRequest,
        params: { organisationId: 'org-123' }
      }

      const result = await getDefraUserRoles(validTokenPayload, request)

      expect(result).toContain(ROLES.standardUser)
    })

    it.each([
      { organisationId: null },
      { organisationId: undefined },
      { organisationId: '' }
    ])(
      'is not assigned when request does not specify an organisationId',
      async ({ organisationId }) => {
        const request = {
          ...mockRequest,
          params: { organisationId }
        }

        const result = await getDefraUserRoles(validTokenPayload, request)

        expect(result).not.toContain(ROLES.standardUser)
      }
    )

    test('is not assigned when organisation does not exist', async () => {
      const request = {
        ...mockRequest,
        params: { organisationId: 'org-123' }
      }

      mockOrganisationsRepository.findById.mockRejectedValue(
        new Error('Organisation not found')
      )

      const result = await getDefraUserRoles(validTokenPayload, request)

      expect(result).not.toContain(ROLES.standardUser)
    })

    test('is not assigned users token does not specify an Defra Id organsition id', async () => {
      const request = {
        ...mockRequest,
        params: { organisationId: 'org-123' }
      }
      mockGetDefraTokenSummary.mockReturnValue({})

      const result = await getDefraUserRoles(validTokenPayload, request)

      expect(result).not.toContain(ROLES.standardUser)
    })

    test("is not assigned when organisation is not linked to user's Defra org", async () => {
      const request = {
        ...mockRequest,
        params: { organisationId: 'org-123' }
      }

      mockOrganisationsRepository.findById.mockResolvedValue({
        id: 'org-123',
        linkedDefraOrganisation: { orgId: 'different-defra-org-456' },
        status: 'active'
      })

      const result = await getDefraUserRoles(validTokenPayload, request)

      expect(result).not.toContain(ROLES.standardUser)
    })

    test('is not assigned when organisation status is not active', async () => {
      const request = {
        ...mockRequest,
        params: { organisationId: 'org-123' }
      }

      mockOrganisationsRepository.findById.mockResolvedValue({
        id: 'org-123',
        linkedDefraOrganisation: { orgId: 'defra-org-123' },
        status: 'suspended'
      })

      const result = await getDefraUserRoles(validTokenPayload, request)

      expect(result).not.toContain(ROLES.standardUser)
    })
  })
})
