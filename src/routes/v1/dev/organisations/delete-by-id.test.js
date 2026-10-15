import { StatusCodes } from 'http-status-codes'
import { vi } from 'vitest'

import { it } from '#vite/fixtures/server.js'

describe('DELETE /v1/dev/organisations/{id}', () => {
  const deleteOrg = (server, id) =>
    server.inject({
      method: 'DELETE',
      url: `/v1/dev/organisations/${id}`
    })

  describe('feature flag disabled', () => {
    it.override({ config: { featureFlags: { devEndpoints: false } } })

    it('returns 404 when devEndpoints feature flag is disabled', async ({
      server
    }) => {
      const response = await deleteOrg(server, 506544)

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('feature flag enabled', () => {
    const stubCounts = {
      'packaging-recycling-notes': 3,
      reports: 4,
      'summary-logs': 1,
      'overseas-sites': 0,
      'epr-organisations': 1
    }
    const nonProdDataReset = {
      deleteByOrgId: vi.fn(async () => stubCounts)
    }

    it.override({
      config: { featureFlags: { devEndpoints: true } },
      repositories: { nonProdDataReset }
    })

    it.for([
      { description: 'non-numeric', id: 'not-a-number' },
      {
        description: 'a Mongo ObjectId hex string',
        id: '507f1f77bcf86cd799439011'
      },
      { description: 'zero or negative', id: '0' }
    ])('returns 422 when id is $description', async ({ id }, { server }) => {
      const response = await deleteOrg(server, id)

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('does not require authentication', async ({ server }) => {
      const response = await deleteOrg(server, 506544)

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('returns 200 with the counts surfaced by the reset module', async ({
      server
    }) => {
      const orgId = 506544

      const response = await deleteOrg(server, orgId)

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toStrictEqual({
        orgId,
        deletedCounts: stubCounts
      })
    })

    it('passes the numeric path id through to the reset module', async ({
      server
    }) => {
      const orgId = 506544

      await deleteOrg(server, orgId)

      expect(nonProdDataReset.deleteByOrgId).toHaveBeenCalledWith(orgId)
    })
  })
})
