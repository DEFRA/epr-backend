import { vi, beforeEach, describe, it, expect } from 'vitest'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createTestServer } from '#test/create-test-server.js'
import { StatusCodes } from 'http-status-codes'
import { testInvalidTokenScenarios } from '#vite/helpers/test-invalid-token-scenarios.js'
import { testOnlyServiceMaintainerCanAccess } from '#vite/helpers/test-invalid-roles-scenarios.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryPublicRegisterRepository } from '#adapters/repositories/public-register/inmemory.js'
import { buildApprovedOrg } from '#vite/helpers/build-approved-org.js'
import { publicRegisterGeneratePath } from '#routes/v1/public-register/generate/post.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'

const mockAuditPublicRegisterGenerate = vi.fn()

vi.mock('#root/auditing/public-register.js', () => ({
  auditPublicRegisterGenerate: (...args) =>
    mockAuditPublicRegisterGenerate(...args)
}))

const { validToken } = entraIdMockAuthTokens

describe(`POST ${publicRegisterGeneratePath}`, () => {
  setupAuthContext()
  let server
  /** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository **/
  let inMemoryOrganisationsRepository
  let inMemoryOrganisationsRepositoryFactory

  /** @param {import('#domain/public-register/repository/port.js').PublicRegisterRepository} publicRegisterRepository - Public register repository*/
  let inMemoryPublicRegisterRepository

  beforeEach(async () => {
    mockAuditPublicRegisterGenerate.mockClear()
    inMemoryPublicRegisterRepository = createInMemoryPublicRegisterRepository()
    inMemoryOrganisationsRepositoryFactory =
      createInMemoryOrganisationsRepository()
    inMemoryOrganisationsRepository = inMemoryOrganisationsRepositoryFactory()
    await buildApprovedOrg(inMemoryOrganisationsRepository)
    server = await createTestServer({
      repositories: {
        organisationsRepository: inMemoryOrganisationsRepositoryFactory,
        publicRegisterRepository: inMemoryPublicRegisterRepository
      }
    })
  })

  describe('happy path', () => {
    const makeRequest = async () => {
      return server.inject({
        method: 'POST',
        url: publicRegisterGeneratePath,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })
    }

    it('returns 201 when public register is generated', async () => {
      const response = await makeRequest()

      expect(response.statusCode).toBe(StatusCodes.CREATED)

      const result = JSON.parse(response.payload)
      expect(result).toEqual(
        expect.objectContaining({
          status: 'generated',
          downloadUrl: expect.any(String),
          generatedAt: expect.any(String),
          expiresAt: expect.any(String)
        })
      )

      expect(mockAuditPublicRegisterGenerate).toHaveBeenCalledTimes(1)
      const [request, context] = mockAuditPublicRegisterGenerate.mock.calls[0]
      expect(request.auth.credentials.id).toBeDefined()
      expect(request.auth.credentials.email).toBeDefined()
      expect(request.auth.credentials.scope).toContain('service_maintainer')
      expect(context.url).toBe(result.downloadUrl)
      expect(context.expiresAt).toBe(result.expiresAt)
      expect(context.generatedAt).toBe(result.generatedAt)
    })
  })

  describe('error handling', () => {
    it('returns 500 when public register generation fails', async () => {
      // Create a factory that returns a repository that throws an error
      const failingOrganisationsRepositoryFactory = () => ({
        ...inMemoryOrganisationsRepository,
        findAll: async () => {
          throw new Error('Database error')
        }
      })

      server = await createTestServer({
        repositories: {
          organisationsRepository: failingOrganisationsRepositoryFactory,
          publicRegisterRepository: inMemoryPublicRegisterRepository
        }
      })

      const response = await server.inject({
        method: 'POST',
        url: publicRegisterGeneratePath,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      const result = JSON.parse(response.payload)
      // Boom returns generic message in non-production mode
      expect(result.message).toBe('An internal server error occurred')
    })
  })

  testInvalidTokenScenarios({
    server: () => server,
    makeRequest: async () => {
      return {
        method: 'POST',
        url: publicRegisterGeneratePath
      }
    },
    additionalExpectations: (response) => {
      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    }
  })

  testOnlyServiceMaintainerCanAccess({
    server: () => server,
    makeRequest: async () => {
      return {
        method: 'POST',
        url: publicRegisterGeneratePath
      }
    },
    successStatus: StatusCodes.CREATED
  })
})
