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

const urlForYear = (year) => `${wasteBalanceAvailabilityPath}?year=${year}`

describe(`GET ${wasteBalanceAvailabilityPath}`, () => {
  setupAuthContext()
  let server

  beforeEach(async () => {
    mockAggregateAvailableBalance.mockClear()
    mockAggregateAvailableBalance.mockResolvedValue(defaultBalanceData)
    server = await createTestServer({ repositories: {} })
  })

  const get = (url) =>
    server.inject({
      method: 'GET',
      url,
      headers: { Authorization: `Bearer ${validToken}` }
    })

  it('reports the year asked for', async () => {
    const response = await get(urlForYear(2026))

    expect(response.statusCode).toBe(StatusCodes.OK)
    const [, , year] = mockAggregateAvailableBalance.mock.calls[0]
    expect(year).toBe(2026)
  })

  it.for([
    ['no year', wasteBalanceAvailabilityPath],
    ['a year that is not a number', urlForYear('last')],
    ['a year before the service holds data', urlForYear(2023)],
    ['a year not yet open', urlForYear(2099)]
  ])('refuses %s', async ([, url]) => {
    const response = await get(url)

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(mockAggregateAvailableBalance).not.toHaveBeenCalled()
  })

  describe('error handling', () => {
    it('returns 500 when aggregation fails', async () => {
      mockAggregateAvailableBalance.mockRejectedValue(
        new Error('Database error')
      )

      const response = await get(urlForYear(2026))

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      const result = JSON.parse(response.payload)
      expect(result.message).toBe('An internal server error occurred')
    })
  })

  testInvalidTokenScenarios({
    server: () => server,
    makeRequest: async () => ({
      method: 'GET',
      url: urlForYear(2026)
    })
  })

  testOnlyServiceMaintainerCanAccess({
    server: () => server,
    makeRequest: async () => ({
      method: 'GET',
      url: urlForYear(2026)
    }),
    successStatus: StatusCodes.OK
  })
})
