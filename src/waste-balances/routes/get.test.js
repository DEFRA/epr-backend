import { describe, it, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryStreamRepository } from '#waste-balances/repository/stream-inmemory.js'
import { createInMemoryWasteBalancesRepository } from '#waste-balances/repository/inmemory.js'
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
  const buildRepository = async (balances) => {
    const streamRepository = createInMemoryStreamRepository()()
    const shells = balances.map(
      ({ accreditationId, organisationId: orgId, registrationId }) => ({
        accreditationId,
        organisationId: orgId,
        registrationId,
        amount: 0,
        availableAmount: 0,
        version: 1,
        schemaVersion: 1
      })
    )
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
    return createInMemoryWasteBalancesRepository(shells, { streamRepository })
  }

  describe('with valid authentication and standard data', () => {
    let server

    beforeEach(async () => {
      const wasteBalancesRepositoryFactory = await buildRepository([
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
      ])

      const featureFlags = createInMemoryFeatureFlags({})

      server = await createTestServer({
        repositories: {
          wasteBalancesRepository: wasteBalancesRepositoryFactory
        },
        featureFlags
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

    it('returns empty object for non-existent accreditation IDs', async () => {
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

    it('handles mixed existing and non-existing IDs', async () => {
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
      const wasteBalancesRepositoryFactory = await buildRepository([
        {
          accreditationId: accreditationId1,
          organisationId,
          registrationId: registrationId1,
          amount: 1000,
          availableAmount: 750
        }
      ])

      const featureFlags = createInMemoryFeatureFlags({})

      server = await createTestServer({
        repositories: {
          wasteBalancesRepository: wasteBalancesRepositoryFactory
        },
        featureFlags
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
      const wasteBalancesRepositoryFactory = await buildRepository([
        {
          accreditationId: accreditationId1,
          organisationId,
          registrationId: registrationId1,
          amount: 1000,
          availableAmount: 750
        }
      ])

      const featureFlags = createInMemoryFeatureFlags({})

      server = await createTestServer({
        repositories: {
          wasteBalancesRepository: wasteBalancesRepositoryFactory
        },
        featureFlags
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
    it('resolves a balance with no stream events to zero amounts', async () => {
      const accreditationIdWithNoEvents = 'aaaaaaaaaaaaaaaaaaaaaaaa'
      const wasteBalancesRepositoryFactory =
        createInMemoryWasteBalancesRepository(
          [
            {
              accreditationId: accreditationIdWithNoEvents,
              organisationId,
              registrationId: registrationId1,
              amount: 0,
              availableAmount: 0,
              version: 1,
              schemaVersion: 1
            }
          ],
          { streamRepository: createInMemoryStreamRepository()() }
        )

      const featureFlags = createInMemoryFeatureFlags({})
      const server = await createTestServer({
        repositories: {
          wasteBalancesRepository: wasteBalancesRepositoryFactory
        },
        featureFlags
      })

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/waste-balances?accreditationIds=${accreditationIdWithNoEvents}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result).toEqual({
        [accreditationIdWithNoEvents]: {
          amount: 0,
          availableAmount: 0
        }
      })
    })
  })

  describe('authorization checks', () => {
    it('returns 403 when accreditation belongs to a different organisation', async () => {
      const differentOrgId = '7777777777777777777777ff'
      const accreditationIdDifferentOrg = 'bbbbbbbbbbbbbbbbbbbbbbbb'

      const wasteBalancesRepositoryFactory = await buildRepository([
        {
          accreditationId: accreditationIdDifferentOrg,
          organisationId: differentOrgId,
          registrationId: registrationId1,
          amount: 1000,
          availableAmount: 750
        }
      ])

      const featureFlags = createInMemoryFeatureFlags({})
      const server = await createTestServer({
        repositories: {
          wasteBalancesRepository: wasteBalancesRepositoryFactory
        },
        featureFlags
      })

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/waste-balances?accreditationIds=${accreditationIdDifferentOrg}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
      const result = JSON.parse(response.payload)
      expect(result.error).toBe('Forbidden')
      expect(result.message).toContain(accreditationIdDifferentOrg)
      expect(result.message).toContain(organisationId)
    })

    it('returns 403 when one of multiple accreditations belongs to a different organisation', async () => {
      const differentOrgId = '7777777777777777777777ff'
      const accreditationIdDifferentOrg = 'bbbbbbbbbbbbbbbbbbbbbbbb'

      const wasteBalancesRepositoryFactory = await buildRepository([
        {
          accreditationId: accreditationId1,
          organisationId,
          registrationId: registrationId1,
          amount: 1000,
          availableAmount: 750
        },
        {
          accreditationId: accreditationIdDifferentOrg,
          organisationId: differentOrgId,
          registrationId: registrationId2,
          amount: 2000,
          availableAmount: 1500
        }
      ])

      const featureFlags = createInMemoryFeatureFlags({})
      const server = await createTestServer({
        repositories: {
          wasteBalancesRepository: wasteBalancesRepositoryFactory
        },
        featureFlags
      })

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/waste-balances?accreditationIds=${accreditationId1},${accreditationIdDifferentOrg}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
      const result = JSON.parse(response.payload)
      expect(result.error).toBe('Forbidden')
      expect(result.message).toContain(accreditationIdDifferentOrg)
    })
  })
})
