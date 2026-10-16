import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { vi } from 'vitest'

import { buildOverseasSite } from '#overseas-sites/repository/contract/test-data.js'
import { asServiceMaintainer, asOperator } from '#test/inject-auth.js'
import { it } from '#vite/fixtures/server.js'
import { overseasSitesListPath } from './list.js'

describe(`${overseasSitesListPath} route`, () => {
  const listSiteNames = async (server, query = '') => {
    const response = await server.inject({
      method: 'GET',
      url: `/v1/overseas-sites${query}`,
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)

    return JSON.parse(response.payload).map((site) => site.name)
  }

  describe('successful requests', () => {
    it('returns 200 with empty list when no sites exist', async ({
      server
    }) => {
      expect(await listSiteNames(server)).toStrictEqual([])
    })

    it('returns 200 with all sites', async ({ server }) => {
      await server.app.overseasSitesRepository.create(
        buildOverseasSite({ name: 'Site Alpha' })
      )
      await server.app.overseasSitesRepository.create(
        buildOverseasSite({ name: 'Site Bravo' })
      )

      expect(await listSiteNames(server)).toStrictEqual([
        'Site Alpha',
        'Site Bravo'
      ])
    })

    it('filters by name query parameter', async ({ server }) => {
      await server.app.overseasSitesRepository.create(
        buildOverseasSite({ name: 'Unique Filter Target' })
      )
      await server.app.overseasSitesRepository.create(
        buildOverseasSite({ name: 'Other Site' })
      )

      expect(await listSiteNames(server, '?name=Unique+Filter')).toStrictEqual([
        'Unique Filter Target'
      ])
    })

    it('filters by country query parameter', async ({ server }) => {
      await server.app.overseasSitesRepository.create(
        buildOverseasSite({ name: 'Narnian Site', country: 'Narnia' })
      )
      await server.app.overseasSitesRepository.create(
        buildOverseasSite({ name: 'Other Site', country: 'France' })
      )

      expect(await listSiteNames(server, '?country=Narnia')).toStrictEqual([
        'Narnian Site'
      ])
    })
  })

  describe('authorisation', () => {
    it('returns 401 when not authenticated', async ({ server }) => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/overseas-sites'
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 when authenticated as standard user', async ({
      server
    }) => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/overseas-sites',
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })

  describe('error handling', () => {
    it('re-throws Boom errors from repository', async ({ server }) => {
      vi.spyOn(
        server.app.overseasSitesRepository,
        'findAll'
      ).mockRejectedValueOnce(Boom.badRequest('Invalid query'))

      const response = await server.inject({
        method: 'GET',
        url: '/v1/overseas-sites',
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
    })

    it('returns 500 for unexpected errors', async ({ server }) => {
      vi.spyOn(
        server.app.overseasSitesRepository,
        'findAll'
      ).mockRejectedValueOnce(new Error('Database connection failed'))

      const response = await server.inject({
        method: 'GET',
        url: '/v1/overseas-sites',
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    })
  })
})
