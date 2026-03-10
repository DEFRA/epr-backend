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
import { overseasSiteUpdatePath } from './put-by-id.js'

describe(`${overseasSiteUpdatePath} route`, () => {
  setupAuthContext()

  describe('when feature flag is enabled', () => {
    let server
    let overseasSitesRepository

    beforeAll(async () => {
      overseasSitesRepository = createInMemoryOverseasSitesRepository()()
      vi.spyOn(overseasSitesRepository, 'update')

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
      it('returns 200 with updated site', async () => {
        const created =
          await overseasSitesRepository.create(buildOverseasSite())

        const response = await server.inject({
          method: 'PUT',
          url: `/v1/overseas-sites/${created.id}`,
          ...asServiceMaintainer(),
          payload: { name: 'Updated Name' }
        })

        expect(response.statusCode).toBe(StatusCodes.OK)

        const body = JSON.parse(response.payload)
        expect(body.id).toBe(created.id)
        expect(body.name).toBe('Updated Name')
      })

      it('updates address fields', async () => {
        const created =
          await overseasSitesRepository.create(buildOverseasSite())

        const newAddress = {
          line1: '99 New Street',
          townOrCity: 'New Town'
        }

        const response = await server.inject({
          method: 'PUT',
          url: `/v1/overseas-sites/${created.id}`,
          ...asServiceMaintainer(),
          payload: { address: newAddress }
        })

        expect(response.statusCode).toBe(StatusCodes.OK)

        const body = JSON.parse(response.payload)
        expect(body.address.line1).toBe(newAddress.line1)
        expect(body.address.townOrCity).toBe(newAddress.townOrCity)
      })

      it('sets updatedAt timestamp', async () => {
        const created =
          await overseasSitesRepository.create(buildOverseasSite())

        const response = await server.inject({
          method: 'PUT',
          url: `/v1/overseas-sites/${created.id}`,
          ...asServiceMaintainer(),
          payload: { name: 'Timestamp Test' }
        })

        expect(response.statusCode).toBe(StatusCodes.OK)

        const body = JSON.parse(response.payload)
        expect(body.updatedAt).toBeDefined()
      })
    })

    describe('not found', () => {
      it('returns 404 when site does not exist', async () => {
        const response = await server.inject({
          method: 'PUT',
          url: '/v1/overseas-sites/aaaaaaaaaaaaaaaaaaaaaaaa',
          ...asServiceMaintainer(),
          payload: { name: 'Nonexistent' }
        })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })
    })

    describe('validation errors', () => {
      it('returns 422 when payload is empty', async () => {
        const response = await server.inject({
          method: 'PUT',
          url: '/v1/overseas-sites/aaaaaaaaaaaaaaaaaaaaaaaa',
          ...asServiceMaintainer(),
          payload: {}
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 when address.line1 is not a string', async () => {
        const response = await server.inject({
          method: 'PUT',
          url: '/v1/overseas-sites/aaaaaaaaaaaaaaaaaaaaaaaa',
          ...asServiceMaintainer(),
          payload: { address: { line1: 123 } }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })
    })

    describe('authorisation', () => {
      it('returns 401 when not authenticated', async () => {
        const response = await server.inject({
          method: 'PUT',
          url: '/v1/overseas-sites/aaaaaaaaaaaaaaaaaaaaaaaa',
          payload: { name: 'Test' }
        })

        expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
      })

      it('returns 403 when authenticated as standard user', async () => {
        const response = await server.inject({
          method: 'PUT',
          url: '/v1/overseas-sites/aaaaaaaaaaaaaaaaaaaaaaaa',
          ...asStandardUser({ linkedOrgId: 'org-123' }),
          payload: { name: 'Test' }
        })

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
      })
    })

    describe('error handling', () => {
      it('re-throws Boom errors from repository', async () => {
        const Boom = await import('@hapi/boom')
        overseasSitesRepository.update.mockRejectedValueOnce(
          Boom.default.badRequest('Invalid data')
        )

        const response = await server.inject({
          method: 'PUT',
          url: '/v1/overseas-sites/aaaaaaaaaaaaaaaaaaaaaaaa',
          ...asServiceMaintainer(),
          payload: { name: 'Test' }
        })

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      })

      it('returns 500 for unexpected errors', async () => {
        overseasSitesRepository.update.mockRejectedValueOnce(
          new Error('Database connection failed')
        )

        const response = await server.inject({
          method: 'PUT',
          url: '/v1/overseas-sites/aaaaaaaaaaaaaaaaaaaaaaaa',
          ...asServiceMaintainer(),
          payload: { name: 'Test' }
        })

        expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      })
    })
  })
})
