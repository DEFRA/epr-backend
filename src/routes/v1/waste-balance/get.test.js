import { describe, it, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryWasteBalancesRepository } from '#repositories/waste-balances/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'

const { validToken } = entraIdMockAuthTokens

describe('GET /v1/waste-balance', () => {
  setupAuthContext()

  let server
  let wasteBalancesRepositoryFactory

  const accreditationId1 = '507f1f77bcf86cd799439011'
  const accreditationId2 = '507f191e810c19729de860ea'
  const nonExistentId = '000000000000000000000000'

  beforeEach(async () => {
    wasteBalancesRepositoryFactory = createInMemoryWasteBalancesRepository([
      {
        accreditationId: accreditationId1,
        amount: 1000,
        availableAmount: 750,
        transactions: [],
        version: 1
      },
      {
        accreditationId: accreditationId2,
        amount: 2500,
        availableAmount: 2500,
        transactions: [],
        version: 1
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
      url: `/v1/waste-balance?accreditationIds=${accreditationId1},${accreditationId2}`,
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
      url: `/v1/waste-balance?accreditationIds=${accreditationId1}`,
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

  it('returns zero balances for non-existent accreditation IDs', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/v1/waste-balance?accreditationIds=${nonExistentId}`,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result).toEqual({
      [nonExistentId]: {
        amount: 0,
        availableAmount: 0
      }
    })
  })

  it('handles mixed existing and non-existing IDs', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/v1/waste-balance?accreditationIds=${accreditationId1},${nonExistentId}`,
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
      [nonExistentId]: {
        amount: 0,
        availableAmount: 0
      }
    })
  })

  it('rejects invalid accreditation ID format', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/waste-balance?accreditationIds=invalid',
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('rejects when accreditationIds parameter is missing', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/waste-balance',
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('requires authentication', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/v1/waste-balance?accreditationIds=${accreditationId1}`
    })

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
  })

  it('handles duplicate IDs in the request', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/v1/waste-balance?accreditationIds=${accreditationId1},${accreditationId1}`,
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

  it('defaults null amount values to zero', async () => {
    const accreditationIdWithNulls = 'aaaaaaaaaaaaaaaaaaaaaaaa'
    wasteBalancesRepositoryFactory = createInMemoryWasteBalancesRepository([
      {
        accreditationId: accreditationIdWithNulls,
        amount: null,
        availableAmount: null,
        transactions: [],
        version: 1
      }
    ])

    const featureFlags = createInMemoryFeatureFlags({})
    server = await createTestServer({
      repositories: {
        wasteBalancesRepository: wasteBalancesRepositoryFactory
      },
      featureFlags
    })

    const response = await server.inject({
      method: 'GET',
      url: `/v1/waste-balance?accreditationIds=${accreditationIdWithNulls}`,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result).toEqual({
      [accreditationIdWithNulls]: {
        amount: 0,
        availableAmount: 0
      }
    })
  })
})
