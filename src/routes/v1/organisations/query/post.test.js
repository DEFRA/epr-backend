import { describe, it, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'

const { validToken } = entraIdMockAuthTokens

describe('POST /v1/organisations/query', () => {
  setupAuthContext()
  let server
  let organisationsRepositoryFactory
  let organisationsRepository

  beforeEach(async () => {
    organisationsRepositoryFactory = createInMemoryOrganisationsRepository([])
    organisationsRepository = organisationsRepositoryFactory()
    const featureFlags = createInMemoryFeatureFlags({ organisations: true })

    server = await createTestServer({
      repositories: { organisationsRepository: organisationsRepositoryFactory },
      featureFlags
    })
  })

  describe('happy path', () => {
    it('returns 200 and all organisations when filter is empty', async () => {
      const org1 = buildOrganisation()
      const org2 = buildOrganisation()

      await organisationsRepository.insert(org1)
      await organisationsRepository.insert(org2)

      const response = await server.inject({
        method: 'POST',
        url: '/v1/organisations/query',
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          filter: {}
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe(org1.id)
      expect(result[1].id).toBe(org2.id)
    })

    it('returns 200 and empty array when no organisations match filter', async () => {
      const org1 = buildOrganisation()
      await organisationsRepository.insert(org1)

      const response = await server.inject({
        method: 'POST',
        url: '/v1/organisations/query',
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          filter: {
            'companyDetails.name': 'Non-existent Company'
          }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result).toHaveLength(0)
    })

    it('returns organisations filtered by companyDetails.name', async () => {
      const org1 = buildOrganisation({
        companyDetails: {
          name: 'ACME Ltd',
          tradingName: 'ACME Trading',
          registrationNumber: 'AC123456',
          registeredAddress: {
            line1: '123 Main St',
            town: 'London',
            postcode: 'SW1A 1AA'
          }
        }
      })

      const org2 = buildOrganisation({
        companyDetails: {
          name: 'TechCorp Inc',
          tradingName: 'TechCorp',
          registrationNumber: 'TC789012',
          registeredAddress: {
            line1: '456 Tech Ave',
            town: 'Manchester',
            postcode: 'M1 1AA'
          }
        }
      })

      const org3 = buildOrganisation({
        companyDetails: {
          name: 'ACME Ltd',
          tradingName: 'ACME Solutions',
          registrationNumber: 'AC999999',
          registeredAddress: {
            line1: '789 Oak Road',
            town: 'Birmingham',
            postcode: 'B1 1AA'
          }
        }
      })

      await organisationsRepository.insert(org1)
      await organisationsRepository.insert(org2)
      await organisationsRepository.insert(org3)

      const response = await server.inject({
        method: 'POST',
        url: '/v1/organisations/query',
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          filter: {
            'companyDetails.name': 'ACME Ltd'
          }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result).toHaveLength(2)
      expect(result[0].companyDetails.name).toBe('ACME Ltd')
      expect(result[1].companyDetails.name).toBe('ACME Ltd')
      expect(result.map((r) => r.id).sort()).toEqual([org1.id, org3.id].sort())
    })

    it('returns organisations filtered by orgId', async () => {
      const org1 = buildOrganisation({ orgId: 12345 })
      const org2 = buildOrganisation({ orgId: 67890 })

      await organisationsRepository.insert(org1)
      await organisationsRepository.insert(org2)

      const response = await server.inject({
        method: 'POST',
        url: '/v1/organisations/query',
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          filter: {
            orgId: 12345
          }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(org1.id)
      expect(result[0].orgId).toBe(12345)
    })

    it('returns organisations filtered by submittedToRegulator', async () => {
      const org1 = buildOrganisation({ submittedToRegulator: 'ea' })
      const org2 = buildOrganisation({ submittedToRegulator: 'sepa' })
      const org3 = buildOrganisation({ submittedToRegulator: 'ea' })

      await organisationsRepository.insert(org1)
      await organisationsRepository.insert(org2)
      await organisationsRepository.insert(org3)

      const response = await server.inject({
        method: 'POST',
        url: '/v1/organisations/query',
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          filter: {
            submittedToRegulator: 'ea'
          }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result).toHaveLength(2)
      expect(result.every((org) => org.submittedToRegulator === 'ea')).toBe(
        true
      )
    })

    it('returns organisations with multiple filter criteria', async () => {
      const org1 = buildOrganisation({
        orgId: 50001,
        submittedToRegulator: 'ea'
      })
      const org2 = buildOrganisation({
        orgId: 50001,
        submittedToRegulator: 'sepa'
      })
      const org3 = buildOrganisation({
        orgId: 50002,
        submittedToRegulator: 'ea'
      })

      await organisationsRepository.insert(org1)
      await organisationsRepository.insert(org2)
      await organisationsRepository.insert(org3)

      const response = await server.inject({
        method: 'POST',
        url: '/v1/organisations/query',
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          filter: {
            orgId: 50001,
            submittedToRegulator: 'ea'
          }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(org1.id)
    })

    it('includes Cache-Control header in successful response', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'POST',
        url: '/v1/organisations/query',
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          filter: {}
        }
      })

      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    })

    it('enriches results with current status from statusHistory', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'POST',
        url: '/v1/organisations/query',
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          filter: {}
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result[0].status).toBe('created')
      expect(result[0].registrations[0].status).toBe('created')
      expect(result[0].accreditations[0].status).toBe('created')
    })
  })

  describe('validation', () => {
    it('returns 400 when filter is missing', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/organisations/query',
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {}
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
    })

    it('returns 400 when payload is invalid', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/organisations/query',
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          filter: 'invalid-not-an-object'
        }
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
    })

    it('returns 400 when no payload is provided', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/organisations/query',
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
    })

    it('accepts null values in filter', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'POST',
        url: '/v1/organisations/query',
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          filter: {
            someField: null
          }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })
  })

  describe('authorization', () => {
    it('returns 401 when no auth token provided', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/organisations/query',
        payload: {
          filter: {}
        }
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })
  })

  describe('edge cases', () => {
    it('handles query with no results gracefully', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/organisations/query',
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          filter: {
            orgId: 999999999
          }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result).toEqual([])
    })

    it('handles complex nested filter queries', async () => {
      const org = buildOrganisation({
        companyDetails: {
          name: 'Complex Query Test Ltd',
          tradingName: 'CQT',
          registrationNumber: '12345678',
          registeredAddress: {
            line1: '789 Test St',
            town: 'TestTown',
            postcode: 'TT1 1TT'
          }
        }
      })
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'POST',
        url: '/v1/organisations/query',
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          filter: {
            'companyDetails.name': 'Complex Query Test Ltd',
            'companyDetails.registeredAddress.town': 'TestTown'
          }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result.length).toBeGreaterThanOrEqual(1)
      expect(result[0].companyDetails.name).toBe('Complex Query Test Ltd')
    })

    it('handles large result sets', async () => {
      const organisations = Array.from({ length: 50 }, () =>
        buildOrganisation()
      )
      await Promise.all(
        organisations.map((org) => organisationsRepository.insert(org))
      )

      const response = await server.inject({
        method: 'POST',
        url: '/v1/organisations/query',
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          filter: {}
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result.length).toBe(50)
    })
  })
})
