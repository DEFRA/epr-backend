import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createTestServer } from '#test/create-test-server.js'
import { testInvalidTokenScenarios } from '#vite/helpers/test-invalid-token-scenarios.js'
import { testOnlyServiceMaintainerCanAccess } from '#vite/helpers/test-invalid-roles-scenarios.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { tonnageMonitoringPath } from './get.js'

const defaultTonnageData = {
  generatedAt: '2026-01-29T12:00:00.000Z',
  materials: [],
  total: 0
}

const mockAggregateTonnageByMaterial = vi
  .fn()
  .mockResolvedValue(defaultTonnageData)

vi.mock('#application/tonnage-monitoring/aggregate-tonnage.js', () => ({
  aggregateTonnageByMaterial: (...args) =>
    mockAggregateTonnageByMaterial(...args)
}))

const { validToken } = entraIdMockAuthTokens

const urlForYear = (year) => `${tonnageMonitoringPath}?year=${year}`

describe(`GET ${tonnageMonitoringPath}`, () => {
  setupAuthContext()
  let server

  beforeEach(async () => {
    mockAggregateTonnageByMaterial.mockClear()
    mockAggregateTonnageByMaterial.mockResolvedValue(defaultTonnageData)
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
    const [, , , year] = mockAggregateTonnageByMaterial.mock.calls[0]
    expect(year).toBe(2026)
  })

  it.for([
    ['no year', tonnageMonitoringPath],
    ['a year that is not a number', urlForYear('last')],
    ['a year before the service holds data', urlForYear(2023)],
    ['a year not yet open', urlForYear(2099)]
  ])('refuses %s', async ([, url]) => {
    const response = await get(url)

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(mockAggregateTonnageByMaterial).not.toHaveBeenCalled()
  })

  describe('error handling', () => {
    it('returns 500 when aggregation fails', async () => {
      mockAggregateTonnageByMaterial.mockRejectedValue(
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
