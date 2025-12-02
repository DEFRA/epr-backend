import { StatusCodes } from 'http-status-codes'
import { createFormSubmissionsRepository } from '#repositories/form-submissions/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { testInvalidTokenScenarios } from '#vite/helpers/test-invalid-token-scenarios.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { testOnlyServiceMaintainerCanAccess } from '#vite/helpers/test-invalid-roles-scenarios.js'

const { validToken } = entraIdMockAuthTokens

const ORG_A = { id: 'org-a' }
const ORG_B = { id: 'org-b' }
const REG_A = { id: 'reg-a', referenceNumber: ORG_B.id }
const REG_B = { id: 'reg-b', referenceNumber: ORG_B.id }
const REG_C = { id: 'reg-c', referenceNumber: 'tuw' }
const ACC_A = { id: 'acc-a', referenceNumber: ORG_B.id }
const ACC_B = { id: 'acc-b', referenceNumber: ORG_B.id }
const ACC_C = { id: 'acc-c', referenceNumber: 'xyz' }

describe('GET /v1/form-submissions/{documentId}', () => {
  setupAuthContext()
  let server

  beforeEach(async () => {
    const formSubmissionsRepositoryFactory = createFormSubmissionsRepository(
      [ACC_A, ACC_B, ACC_C],
      [REG_A, REG_B, REG_C],
      [ORG_A, ORG_B]
    )

    server = await createTestServer({
      repositories: {
        formSubmissionsRepository: formSubmissionsRepositoryFactory
      }
    })
  })

  describe('happy path', () => {
    it('returns 200 with organisation when supplied ID is for an organisation', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/form-submissions/${ORG_A.id}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result).toEqual({
        organisation: ORG_A,
        registrations: [],
        accreditations: []
      })
    })

    it('returns 200 with organisation and linked registrations/accreditations when supplied ID is for an organisation', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/form-submissions/${ORG_B.id}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)

      expect(result).toEqual({
        organisation: ORG_B,
        registrations: [REG_A, REG_B],
        accreditations: [ACC_A, ACC_B]
      })
    })

    it('returns 200 with registrations when supplied ID is for a registration', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/form-submissions/${REG_C.id}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)

      expect(result).toEqual({
        organisation: null,
        registrations: [REG_C],
        accreditations: []
      })
    })

    it('returns 200 with accreditations when supplied ID is for an accreditation', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/form-submissions/${ACC_C.id}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)

      expect(result).toEqual({
        organisation: null,
        registrations: [],
        accreditations: [ACC_C]
      })
    })

    it('includes Cache-Control header in successful response', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/form-submissions/${ORG_A.id}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    })
  })

  describe('not found cases', () => {
    it('returns 404 for documentId that does not exist', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/form-submissions/999999',
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)

      const result = JSON.parse(response.payload)
      expect(result).toEqual({
        organisation: null,
        registrations: [],
        accreditations: []
      })
    })

    it('returns 404 when documentId is missing (whitespace-only path segment)', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/form-submissions/%20%20%20',
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)

      const result = JSON.parse(response.payload)
      expect(result).toEqual({
        organisation: null,
        registrations: [],
        accreditations: []
      })
    })

    it('includes Cache-Control header in error response', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/form-submissions/999999',
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    })
  })

  testInvalidTokenScenarios({
    server: () => server,
    makeRequest: async () => {
      return {
        method: 'GET',
        url: `/v1/form-submissions/${ORG_A.id}`
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
        method: 'GET',
        url: `/v1/form-submissions/${ORG_A.id}`
      }
    }
  })
})
