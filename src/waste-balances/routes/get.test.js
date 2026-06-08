import { describe, it, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryStreamRepository } from '#waste-balances/repository/stream-inmemory.js'
import { createWasteBalancesRepository } from '#waste-balances/repository/repository.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { buildStreamEvent } from '#waste-balances/repository/stream-test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'

const { validToken } = entraIdMockAuthTokens

describe('GET /v1/organisations/{organisationId}/waste-balances', () => {
  setupAuthContext()

  const organisationId = '6507f1f77bcf86cd79943901'
  const accreditationId1 = '507f1f77bcf86cd799439011'
  const accreditationId2 = '507f191e810c19729de860ea'
  const nonExistentId = '000000000000000000000000'
  const registrationId1 = 'reg-1'
  const registrationId2 = 'reg-2'

  /**
   * Build an in-memory waste balances repository whose balances resolve their
   * amounts from a stream seeded with the given closing balances.
   */
  const buildBalancesRepository = async (balances) => {
    const streamRepository = createInMemoryStreamRepository()()
    for (const {
      accreditationId,
      organisationId: orgId,
      registrationId,
      amount,
      availableAmount
    } of balances) {
      await streamRepository.appendEvent(
        buildStreamEvent({
          accreditationId,
          organisationId: orgId,
          registrationId,
          number: 1,
          closingBalance: { amount, availableAmount }
        })
      )
    }
    return createWasteBalancesRepository({ streamRepository })
  }

  /**
   * Build an in-memory organisations repository whose registrations carry the
   * accreditationId -> registrationId links the handler resolves against.
   */
  const buildOrganisationsRepository = (organisations) =>
    createInMemoryOrganisationsRepository(
      organisations.map(({ id, registrations }) =>
        buildOrganisation({
          id,
          registrations: registrations.map(
            ({ registrationId, accreditationId }) =>
              buildRegistration({ id: registrationId, accreditationId })
          )
        })
      )
    )

  const buildServer = async ({ balances, organisations }) =>
    createTestServer({
      repositories: {
        wasteBalancesRepository: await buildBalancesRepository(balances),
        organisationsRepository: buildOrganisationsRepository(organisations)
      },
      featureFlags: createInMemoryFeatureFlags({})
    })

  describe('with valid authentication and standard data', () => {
    let server

    beforeEach(async () => {
      server = await buildServer({
        balances: [
          {
            accreditationId: accreditationId1,
            organisationId,
            registrationId: registrationId1,
            amount: 1000,
            availableAmount: 750
          },
          {
            accreditationId: accreditationId2,
            organisationId,
            registrationId: registrationId2,
            amount: 2500,
            availableAmount: 2500
          }
        ],
        organisations: [
          {
            id: organisationId,
            registrations: [
              {
                registrationId: registrationId1,
                accreditationId: accreditationId1
              },
              {
                registrationId: registrationId2,
                accreditationId: accreditationId2
              }
            ]
          }
        ]
      })
    })

    it('returns waste balances for multiple accreditation IDs', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/waste-balances?accreditationIds=${accreditationId1},${accreditationId2}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result).toEqual({
        [accreditationId1]: {
          amount: 1000,
          availableAmount: 750
        },
        [accreditationId2]: {
          amount: 2500,
          availableAmount: 2500
        }
      })
    })

    it('returns waste balance for a single accreditation ID', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/waste-balances?accreditationIds=${accreditationId1}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result).toEqual({
        [accreditationId1]: {
          amount: 1000,
          availableAmount: 750
        }
      })
    })

    it('omits accreditation IDs not registered to the organisation', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/waste-balances?accreditationIds=${nonExistentId}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result).toEqual({})
    })

    it('returns balances for registered IDs and omits unregistered ones', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/waste-balances?accreditationIds=${accreditationId1},${nonExistentId}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result).toEqual({
        [accreditationId1]: {
          amount: 1000,
          availableAmount: 750
        }
      })
    })

    it('handles duplicate IDs in the request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/waste-balances?accreditationIds=${accreditationId1},${accreditationId1}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result).toEqual({
        [accreditationId1]: {
          amount: 1000,
          availableAmount: 750
        }
      })
    })
  })

  describe('validation errors', () => {
    let server

    beforeEach(async () => {
      server = await buildServer({
        balances: [
          {
            accreditationId: accreditationId1,
            organisationId,
            registrationId: registrationId1,
            amount: 1000,
            availableAmount: 750
          }
        ],
        organisations: [
          {
            id: organisationId,
            registrations: [
              {
                registrationId: registrationId1,
                accreditationId: accreditationId1
              }
            ]
          }
        ]
      })
    })

    it('rejects invalid accreditation ID format', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/waste-balances?accreditationIds=invalid`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects when accreditationIds parameter is missing', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/waste-balances`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects invalid organisationId format', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/invalid/waste-balances?accreditationIds=${accreditationId1}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })

  describe('authentication', () => {
    let server

    beforeEach(async () => {
      server = await buildServer({
        balances: [
          {
            accreditationId: accreditationId1,
            organisationId,
            registrationId: registrationId1,
            amount: 1000,
            availableAmount: 750
          }
        ],
        organisations: [
          {
            id: organisationId,
            registrations: [
              {
                registrationId: registrationId1,
                accreditationId: accreditationId1
              }
            ]
          }
        ]
      })
    })

    it('requires authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/waste-balances?accreditationIds=${accreditationId1}`
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })
  })

  describe('zero balance handling', () => {
    it('resolves a registered accreditation with no stream events to zero amounts', async () => {
      const server = await buildServer({
        balances: [],
        organisations: [
          {
            id: organisationId,
            registrations: [
              {
                registrationId: registrationId1,
                accreditationId: accreditationId1
              }
            ]
          }
        ]
      })

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/waste-balances?accreditationIds=${accreditationId1}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result).toEqual({
        [accreditationId1]: {
          amount: 0,
          availableAmount: 0
        }
      })
    })
  })

  describe('missing organisation', () => {
    const missingOrganisationId = '0123456789abcdef01234567'

    it('omits all accreditations when the organisation does not exist', async () => {
      const server = await buildServer({
        balances: [],
        organisations: []
      })

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${missingOrganisationId}/waste-balances?accreditationIds=${accreditationId1}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result).toEqual({})
    })
  })

  describe('cross-organisation isolation', () => {
    const otherOrganisationId = '7777777777777777777777ff'
    const otherAccreditationId = 'bbbbbbbbbbbbbbbbbbbbbbbb'
    const otherRegistrationId = 'reg-other'

    it('omits an accreditation that belongs to a different organisation', async () => {
      const server = await buildServer({
        balances: [
          {
            accreditationId: otherAccreditationId,
            organisationId: otherOrganisationId,
            registrationId: otherRegistrationId,
            amount: 1000,
            availableAmount: 750
          }
        ],
        organisations: [
          {
            id: organisationId,
            registrations: [
              {
                registrationId: registrationId1,
                accreditationId: accreditationId1
              }
            ]
          },
          {
            id: otherOrganisationId,
            registrations: [
              {
                registrationId: otherRegistrationId,
                accreditationId: otherAccreditationId
              }
            ]
          }
        ]
      })

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/waste-balances?accreditationIds=${otherAccreditationId}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result).toEqual({})
    })

    it('returns only the organisation-owned balances when a request mixes organisations', async () => {
      const server = await buildServer({
        balances: [
          {
            accreditationId: accreditationId1,
            organisationId,
            registrationId: registrationId1,
            amount: 1000,
            availableAmount: 750
          },
          {
            accreditationId: otherAccreditationId,
            organisationId: otherOrganisationId,
            registrationId: otherRegistrationId,
            amount: 2000,
            availableAmount: 1500
          }
        ],
        organisations: [
          {
            id: organisationId,
            registrations: [
              {
                registrationId: registrationId1,
                accreditationId: accreditationId1
              }
            ]
          },
          {
            id: otherOrganisationId,
            registrations: [
              {
                registrationId: otherRegistrationId,
                accreditationId: otherAccreditationId
              }
            ]
          }
        ]
      })

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/waste-balances?accreditationIds=${accreditationId1},${otherAccreditationId}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result).toEqual({
        [accreditationId1]: {
          amount: 1000,
          availableAmount: 750
        }
      })
    })
  })
})
