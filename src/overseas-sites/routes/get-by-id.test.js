import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { vi } from 'vitest'

import { buildOverseasSite } from '#overseas-sites/repository/contract/test-data.js'
import { asServiceMaintainer, asOperator } from '#test/inject-auth.js'
import { it } from '#vite/fixtures/server.js'
import { overseasSiteByIdPath } from './get-by-id.js'

describe(`${overseasSiteByIdPath} route`, () => {
  const unknownSiteUrl = '/v1/overseas-sites/aaaaaaaaaaaaaaaaaaaaaaaa'

  describe('successful requests', () => {
    it('returns 200 with the site', async ({ server }) => {
      const created =
        await server.app.overseasSitesRepository.create(buildOverseasSite())

      const response = await server.inject({
        method: 'GET',
        url: `/v1/overseas-sites/${created.id}`,
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)

      const body = JSON.parse(response.payload)
      expect(body.id).toBe(created.id)
      expect(body.name).toBe(created.name)
      expect(body.country).toBe(created.country)
    })
  })

  describe('not found', () => {
    it('returns 404 when site does not exist', async ({ server }) => {
      const response = await server.inject({
        method: 'GET',
        url: unknownSiteUrl,
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('authorisation', () => {
    it('returns 401 when not authenticated', async ({ server }) => {
      const response = await server.inject({
        method: 'GET',
        url: unknownSiteUrl
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 when authenticated as standard user', async ({
      server
    }) => {
      const response = await server.inject({
        method: 'GET',
        url: unknownSiteUrl,
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })

  describe('error handling', () => {
    it('re-throws Boom errors from repository', async ({ server }) => {
      vi.spyOn(
        server.app.overseasSitesRepository,
        'findById'
      ).mockRejectedValueOnce(Boom.badRequest('Invalid ID'))

      const response = await server.inject({
        method: 'GET',
        url: unknownSiteUrl,
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
    })

    it('returns 500 for unexpected errors', async ({ server }) => {
      vi.spyOn(
        server.app.overseasSitesRepository,
        'findById'
      ).mockRejectedValueOnce(new Error('Database connection failed'))

      const response = await server.inject({
        method: 'GET',
        url: unknownSiteUrl,
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    })
  })
})
