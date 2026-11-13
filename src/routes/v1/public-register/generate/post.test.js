import { vi, beforeEach, describe, it, expect } from 'vitest'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createTestServer } from '#test/create-test-server.js'
import { StatusCodes } from 'http-status-codes'
import { testInvalidTokenScenarios } from '#vite/helpers/test-invalid-token-scenarios.js'
import { testOnlyServiceMaintainerCanAccess } from '#vite/helpers/test-invalid-roles-scenarios.js'
import { createInMemoryOrganisationReadRepository } from '#organisation-read-model/repository/inmemory.js'
import { buildReadApprovedOrganisation } from '#organisation-read-model/repository/read-model-test-data.js'
import { currentUtcYear } from '#common/helpers/dates/year.js'
import { createInMemoryPublicRegisterRepository } from '#adapters/repositories/public-register/inmemory.js'
import { publicRegisterGeneratePath } from '#routes/v1/public-register/generate/post.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { emptyOrganisationReadRepository } from '#vite/helpers/organisation-read-model.js'

const mockAuditPublicRegisterGenerate = vi.fn()

vi.mock('#root/auditing/public-register.js', () => ({
  auditPublicRegisterGenerate: (...args) =>
    mockAuditPublicRegisterGenerate(...args)
}))

const { validToken, readOnlyMaintainerToken } = entraIdMockAuthTokens

describe(`POST ${publicRegisterGeneratePath}`, () => {
  setupAuthContext()
  let server

  /** @param {import('#domain/public-register/repository/port.js').PublicRegisterRepository} publicRegisterRepository - Public register repository*/
  let inMemoryPublicRegisterRepository

  beforeEach(async () => {
    mockAuditPublicRegisterGenerate.mockClear()
    inMemoryPublicRegisterRepository = createInMemoryPublicRegisterRepository()
    server = await createTestServer({
      repositories: {
        organisationReadRepository: createInMemoryOrganisationReadRepository([
          buildReadApprovedOrganisation({ year: currentUtcYear() })
        ]),
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
      expect(request.auth.credentials.scope).toContain('admin.read')
      expect(context.url).toBe(result.downloadUrl)
      expect(context.expiresAt).toBe(result.expiresAt)
      expect(context.generatedAt).toBe(result.generatedAt)
    })

    it('returns 201 for a read-only service maintainer', async () => {
      const response = await server.inject({
        method: 'POST',
        url: publicRegisterGeneratePath,
        headers: {
          Authorization: `Bearer ${readOnlyMaintainerToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.CREATED)
    })
  })

  describe('error handling', () => {
    it('returns 500 when public register generation fails', async () => {
      const failingOrganisationReadRepository = () => ({
        ...emptyOrganisationReadRepository(),
        findAll: async () => {
          throw new Error('Database error')
        }
      })

      server = await createTestServer({
        repositories: {
          organisationReadRepository: failingOrganisationReadRepository,
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
