import { StatusCodes } from 'http-status-codes'
import {
  vi,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach
} from 'vitest'

import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { buildOverseasSite } from '#overseas-sites/repository/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer, asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { overseasSitesListPath } from './list.js'

describe(`${overseasSitesListPath} route`, () => {
  setupAuthContext()

  describe('when feature flag is enabled', () => {
    let server
    let overseasSitesRepository

    beforeAll(async () => {
      overseasSitesRepository = createInMemoryOverseasSitesRepository()()
      vi.spyOn(overseasSitesRepository, 'findAll')

      server = await createTestServer({
        repositories: {
          overseasSitesRepository: () => overseasSitesRepository
        },
        featureFlags: createInMemoryFeatureFlags({
          overseasSites: true
        })
      })
    })

    afterEach(() => {
      vi.clearAllMocks()
    })

    afterAll(async () => {
      await server.stop()
    })

    describe('successful requests', () => {
      it('returns 200 with empty list when no sites exist', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/v1/overseas-sites',
          ...asServiceMaintainer()
        })

        expect(response.statusCode).toBe(StatusCodes.OK)

        const body = JSON.parse(response.payload)
        expect(body).toStrictEqual([])
      })

      it('returns 200 with all sites', async () => {
        await overseasSitesRepository.create(
          buildOverseasSite({ name: 'Site Alpha' })
        )
        await overseasSitesRepository.create(
          buildOverseasSite({ name: 'Site Bravo' })
        )

        const response = await server.inject({
          method: 'GET',
          url: '/v1/overseas-sites',
          ...asServiceMaintainer()
        })

        expect(response.statusCode).toBe(StatusCodes.OK)

        const body = JSON.parse(response.payload)
        expect(body.length).toBeGreaterThanOrEqual(2)
      })

      it('filters by name query parameter', async () => {
        await overseasSitesRepository.create(
          buildOverseasSite({ name: 'Unique Filter Target' })
        )

        const response = await server.inject({
          method: 'GET',
          url: '/v1/overseas-sites?name=Unique+Filter',
          ...asServiceMaintainer()
        })

        expect(response.statusCode).toBe(StatusCodes.OK)

        const body = JSON.parse(response.payload)
        expect(body.length).toBeGreaterThanOrEqual(1)
        expect(body.some((s) => s.name === 'Unique Filter Target')).toBe(true)
      })

      it('filters by country query parameter', async () => {
        await overseasSitesRepository.create(
          buildOverseasSite({ country: 'Narnia' })
        )

        const response = await server.inject({
          method: 'GET',
          url: '/v1/overseas-sites?country=Narnia',
          ...asServiceMaintainer()
        })

        expect(response.statusCode).toBe(StatusCodes.OK)

        const body = JSON.parse(response.payload)
        expect(body.every((s) => s.country === 'Narnia')).toBe(true)
      })
    })

    describe('authorisation', () => {
      it('returns 401 when not authenticated', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/v1/overseas-sites'
        })

        expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
      })

      it('returns 403 when authenticated as standard user', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/v1/overseas-sites',
          ...asStandardUser({ linkedOrgId: 'org-123' })
        })

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
      })
    })

    describe('error handling', () => {
      it('re-throws Boom errors from repository', async () => {
        const Boom = await import('@hapi/boom')
        overseasSitesRepository.findAll.mockRejectedValueOnce(
          Boom.default.badRequest('Invalid query')
        )

        const response = await server.inject({
          method: 'GET',
          url: '/v1/overseas-sites',
          ...asServiceMaintainer()
        })

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      })

      it('returns 500 for unexpected errors', async () => {
        overseasSitesRepository.findAll.mockRejectedValueOnce(
          new Error('Database connection failed')
        )

        const response = await server.inject({
          method: 'GET',
          url: '/v1/overseas-sites',
          ...asServiceMaintainer()
        })

        expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      })
    })
  })
})
