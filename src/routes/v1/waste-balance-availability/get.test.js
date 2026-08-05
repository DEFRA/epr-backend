import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createTestServer } from '#test/create-test-server.js'
import { testInvalidTokenScenarios } from '#vite/helpers/test-invalid-token-scenarios.js'
import { testOnlyServiceMaintainerCanAccess } from '#vite/helpers/test-invalid-roles-scenarios.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { wasteBalanceAvailabilityPath } from './get.js'

const defaultBalanceData = {
  generatedAt: '2026-01-29T12:00:00.000Z',
  materials: [],
  total: 0
}

const mockAggregateAvailableBalance = vi
  .fn()
  .mockResolvedValue(defaultBalanceData)

vi.mock(
  '#application/waste-balance-availability/aggregate-available-balance.js',
  () => ({
    aggregateAvailableBalance: (...args) =>
      mockAggregateAvailableBalance(...args)
  })
)

const { validToken } = entraIdMockAuthTokens

describe(`GET ${wasteBalanceAvailabilityPath}`, () => {
  setupAuthContext()
  let server

  beforeEach(async () => {
    mockAggregateAvailableBalance.mockClear()
    mockAggregateAvailableBalance.mockResolvedValue(defaultBalanceData)
    server = await createTestServer({ repositories: {} })
  })

  describe('error handling', () => {
    it('returns 500 when aggregation fails', async () => {
      mockAggregateAvailableBalance.mockRejectedValue(
        new Error('Database error')
      )

      const response = await server.inject({
        method: 'GET',
        url: wasteBalanceAvailabilityPath,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      const result = JSON.parse(response.payload)
      expect(result.message).toBe('An internal server error occurred')
    })
  })

  testInvalidTokenScenarios({
    server: () => server,
    makeRequest: async () => ({
      method: 'GET',
      url: wasteBalanceAvailabilityPath
    })
  })

  testOnlyServiceMaintainerCanAccess({
    server: () => server,
    makeRequest: async () => ({
      method: 'GET',
      url: wasteBalanceAvailabilityPath
    }),
    successStatus: StatusCodes.OK
  })
})
