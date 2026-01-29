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

describe(`GET ${tonnageMonitoringPath}`, () => {
  setupAuthContext()
  let server

  beforeEach(async () => {
    mockAggregateTonnageByMaterial.mockClear()
    mockAggregateTonnageByMaterial.mockResolvedValue(defaultTonnageData)
    server = await createTestServer({ repositories: {} })
  })

  describe('happy path', () => {
    const makeRequest = async () => {
      return server.inject({
        method: 'GET',
        url: tonnageMonitoringPath,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })
    }

    it('returns 200 with tonnage data', async () => {
      const mockTonnageData = {
        generatedAt: '2026-01-29T12:00:00.000Z',
        materials: [
          { material: 'glass', totalTonnage: 100 },
          { material: 'plastic', totalTonnage: 200 }
        ],
        total: 300
      }
      mockAggregateTonnageByMaterial.mockResolvedValue(mockTonnageData)

      const response = await makeRequest()

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual(mockTonnageData)
    })

    it('calls aggregateTonnageByMaterial with db', async () => {
      const mockTonnageData = {
        generatedAt: '2026-01-29T12:00:00.000Z',
        materials: [],
        total: 0
      }
      mockAggregateTonnageByMaterial.mockResolvedValue(mockTonnageData)

      await makeRequest()

      expect(mockAggregateTonnageByMaterial).toHaveBeenCalledTimes(1)
    })
  })

  describe('error handling', () => {
    it('returns 500 when aggregation fails', async () => {
      mockAggregateTonnageByMaterial.mockRejectedValue(
        new Error('Database error')
      )

      const response = await server.inject({
        method: 'GET',
        url: tonnageMonitoringPath,
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
      url: tonnageMonitoringPath
    }),
    additionalExpectations: (response) => {
      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    }
  })

  testOnlyServiceMaintainerCanAccess({
    server: () => server,
    makeRequest: async () => ({
      method: 'GET',
      url: tonnageMonitoringPath
    }),
    successStatus: StatusCodes.OK
  })
})
