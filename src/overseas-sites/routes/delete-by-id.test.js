import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { vi } from 'vitest'

import { buildOverseasSite } from '#overseas-sites/repository/contract/test-data.js'
import { asServiceMaintainer, asOperator } from '#test/inject-auth.js'
import { it } from '#vite/fixtures/server.js'
import { overseasSiteDeletePath } from './delete-by-id.js'

const mockCdpAuditing = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockCdpAuditing(...args)
}))

describe(`${overseasSiteDeletePath} route`, () => {
  const unknownSiteUrl = '/v1/overseas-sites/aaaaaaaaaaaaaaaaaaaaaaaa'

  const deleteSite = (server, id) =>
    server.inject({
      method: 'DELETE',
      url: `/v1/overseas-sites/${id}`,
      ...asServiceMaintainer()
    })

  describe('successful requests', () => {
    it('returns 204 when site is deleted', async ({ server }) => {
      const created =
        await server.app.overseasSitesRepository.create(buildOverseasSite())

      const response = await deleteSite(server, created.id)

      expect(response.statusCode).toBe(StatusCodes.NO_CONTENT)
    })

    it('removes the site from the repository', async ({ server }) => {
      const created =
        await server.app.overseasSitesRepository.create(buildOverseasSite())

      await deleteSite(server, created.id)

      const found = await server.app.overseasSitesRepository.findById(
        created.id
      )
      expect(found).toBeNull()
    })

    it('records audit event for site deletion', async ({ server }) => {
      const created =
        await server.app.overseasSitesRepository.create(buildOverseasSite())

      const response = await deleteSite(server, created.id)

      expect(response.statusCode).toBe(StatusCodes.NO_CONTENT)

      expect(mockCdpAuditing).toHaveBeenCalledWith(
        expect.objectContaining({
          event: {
            category: 'entity',
            subCategory: 'overseas-sites',
            action: 'delete'
          },
          context: expect.objectContaining({
            siteId: created.id,
            site: expect.objectContaining({ name: created.name })
          })
        })
      )
    })
  })

  describe('not found', () => {
    it('returns 404 when site does not exist', async ({ server }) => {
      const response = await server.inject({
        method: 'DELETE',
        url: unknownSiteUrl,
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('authorisation', () => {
    it('returns 401 when not authenticated', async ({ server }) => {
      const response = await server.inject({
        method: 'DELETE',
        url: unknownSiteUrl
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 when authenticated as standard user', async ({
      server
    }) => {
      const response = await server.inject({
        method: 'DELETE',
        url: unknownSiteUrl,
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })

  describe('error handling', () => {
    it('re-throws Boom errors from repository', async ({ server }) => {
      const created =
        await server.app.overseasSitesRepository.create(buildOverseasSite())
      vi.spyOn(
        server.app.overseasSitesRepository,
        'remove'
      ).mockRejectedValueOnce(Boom.badRequest('Invalid ID'))

      const response = await deleteSite(server, created.id)

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
    })

    it('returns 500 for unexpected errors', async ({ server }) => {
      const created =
        await server.app.overseasSitesRepository.create(buildOverseasSite())
      vi.spyOn(
        server.app.overseasSitesRepository,
        'remove'
      ).mockRejectedValueOnce(new Error('Database connection failed'))

      const response = await deleteSite(server, created.id)

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    })
  })
})
