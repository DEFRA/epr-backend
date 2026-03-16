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
import { overseasSiteByIdPath } from './get-by-id.js'

describe(`${overseasSiteByIdPath} route`, () => {
  setupAuthContext()

  describe('when feature flag is enabled', () => {
    let server
    let overseasSitesRepository

    beforeAll(async () => {
      overseasSitesRepository = createInMemoryOverseasSitesRepository()()
      vi.spyOn(overseasSitesRepository, 'findById')

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
      it('returns 200 with the site', async () => {
        const created =
          await overseasSitesRepository.create(buildOverseasSite())

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
      it('returns 404 when site does not exist', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/v1/overseas-sites/aaaaaaaaaaaaaaaaaaaaaaaa',
          ...asServiceMaintainer()
        })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })
    })

    describe('authorisation', () => {
      it('returns 401 when not authenticated', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/v1/overseas-sites/aaaaaaaaaaaaaaaaaaaaaaaa'
        })

        expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
      })

      it('returns 403 when authenticated as standard user', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/v1/overseas-sites/aaaaaaaaaaaaaaaaaaaaaaaa',
          ...asStandardUser({ linkedOrgId: 'org-123' })
        })

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
      })
    })

    describe('error handling', () => {
      it('re-throws Boom errors from repository', async () => {
        const Boom = await import('@hapi/boom')
        overseasSitesRepository.findById.mockRejectedValueOnce(
          Boom.default.badRequest('Invalid ID')
        )

        const response = await server.inject({
          method: 'GET',
          url: '/v1/overseas-sites/aaaaaaaaaaaaaaaaaaaaaaaa',
          ...asServiceMaintainer()
        })

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      })

      it('returns 500 for unexpected errors', async () => {
        overseasSitesRepository.findById.mockRejectedValueOnce(
          new Error('Database connection failed')
        )

        const response = await server.inject({
          method: 'GET',
          url: '/v1/overseas-sites/aaaaaaaaaaaaaaaaaaaaaaaa',
          ...asServiceMaintainer()
        })

        expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      })
    })
  })
})
