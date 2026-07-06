import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { StatusCodes } from 'http-status-codes'
import { describe, it, expect, beforeEach } from 'vitest'

describe('DELETE /v1/dev/organisations/{id}', () => {
  setupAuthContext()

  describe('feature flag disabled', () => {
    it('returns 404 when devEndpoints feature flag is disabled', async () => {
      const featureFlags = createInMemoryFeatureFlags({
        devEndpoints: false
      })
      const server = await createTestServer({ featureFlags })

      const response = await server.inject({
        method: 'DELETE',
        url: '/v1/dev/organisations/506544'
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('feature flag enabled', () => {
    let server
    const stubCounts = {
      'packaging-recycling-notes': 3,
      reports: 4,
      'waste-records': 17,
      'summary-logs': 1,
      'overseas-sites': 0,
      'epr-organisations': 1
    }

    beforeEach(async () => {
      const featureFlags = createInMemoryFeatureFlags({
        devEndpoints: true
      })
      const nonProdDataReset = {
        deleteByOrgId: async () => stubCounts
      }
      server = await createTestServer({
        featureFlags,
        repositories: { nonProdDataReset }
      })
    })

    it.each([
      ['non-numeric', 'not-a-number'],
      ['a Mongo ObjectId hex string', '507f1f77bcf86cd799439011'],
      ['zero or negative', '0']
    ])('returns 422 when id is %s', async (_description, id) => {
      const response = await server.inject({
        method: 'DELETE',
        url: `/v1/dev/organisations/${id}`
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('does not require authentication', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: '/v1/dev/organisations/506544'
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('returns 200 with the counts surfaced by the reset module', async () => {
      const orgId = 506544

      const response = await server.inject({
        method: 'DELETE',
        url: `/v1/dev/organisations/${orgId}`
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({
        orgId,
        deletedCounts: stubCounts
      })
    })

    it('passes the numeric path id through to the reset module', async () => {
      const orgId = 506544
      const received = []
      const nonProdDataReset = {
        deleteByOrgId: async (id) => {
          received.push(id)
          return {}
        }
      }
      const featureFlags = createInMemoryFeatureFlags({
        devEndpoints: true
      })
      const testServer = await createTestServer({
        featureFlags,
        repositories: { nonProdDataReset }
      })

      await testServer.inject({
        method: 'DELETE',
        url: `/v1/dev/organisations/${orgId}`
      })

      expect(received).toEqual([orgId])
    })
  })
})
