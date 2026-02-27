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
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer, asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { overseasSitesCreatePath } from './post.js'

const validPayload = {
  name: 'Mumbai Reprocessing Plant',
  address: {
    line1: '123 Industrial Avenue',
    townOrCity: 'Mumbai'
  },
  country: 'India'
}

const fullPayload = {
  ...validPayload,
  address: {
    line1: '123 Industrial Avenue',
    line2: 'Industrial Zone B',
    townOrCity: 'Mumbai',
    stateOrRegion: 'Maharashtra',
    postcode: '400001'
  },
  coordinates: "19°04'N 72°52'E",
  validFrom: '2026-01-01T00:00:00.000Z'
}

describe(`${overseasSitesCreatePath} route`, () => {
  setupAuthContext()

  describe('when feature flag is enabled', () => {
    let server
    let overseasSitesRepository

    beforeAll(async () => {
      overseasSitesRepository = createInMemoryOverseasSitesRepository()()
      vi.spyOn(overseasSitesRepository, 'create')

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
      it('returns 201 with created site', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/v1/overseas-sites',
          ...asServiceMaintainer(),
          payload: validPayload
        })

        expect(response.statusCode).toBe(StatusCodes.CREATED)

        const body = JSON.parse(response.payload)
        expect(body.id).toBeDefined()
        expect(body.name).toBe(validPayload.name)
        expect(body.country).toBe(validPayload.country)
        expect(body.address.line1).toBe(validPayload.address.line1)
        expect(body.address.townOrCity).toBe(validPayload.address.townOrCity)
        expect(body.createdAt).toBeDefined()
        expect(body.updatedAt).toBeDefined()
      })

      it('creates site with all optional fields', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/v1/overseas-sites',
          ...asServiceMaintainer(),
          payload: fullPayload
        })

        expect(response.statusCode).toBe(StatusCodes.CREATED)

        const body = JSON.parse(response.payload)
        expect(body.address.line2).toBe(fullPayload.address.line2)
        expect(body.address.stateOrRegion).toBe(
          fullPayload.address.stateOrRegion
        )
        expect(body.address.postcode).toBe(fullPayload.address.postcode)
        expect(body.coordinates).toBe(fullPayload.coordinates)
        expect(body.validFrom).toBeDefined()
      })

      it('passes correct data to repository', async () => {
        await server.inject({
          method: 'POST',
          url: '/v1/overseas-sites',
          ...asServiceMaintainer(),
          payload: validPayload
        })

        expect(overseasSitesRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            name: validPayload.name,
            country: validPayload.country,
            address: expect.objectContaining({
              line1: validPayload.address.line1,
              townOrCity: validPayload.address.townOrCity
            }),
            createdAt: expect.any(Date),
            updatedAt: expect.any(Date)
          })
        )
      })
    })

    describe('validation errors', () => {
      it('returns 422 when name is missing', async () => {
        const { name: _name, ...payloadWithoutName } = validPayload

        const response = await server.inject({
          method: 'POST',
          url: '/v1/overseas-sites',
          ...asServiceMaintainer(),
          payload: payloadWithoutName
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 when country is missing', async () => {
        const { country: _country, ...payloadWithoutCountry } = validPayload

        const response = await server.inject({
          method: 'POST',
          url: '/v1/overseas-sites',
          ...asServiceMaintainer(),
          payload: payloadWithoutCountry
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 when address is missing', async () => {
        const { address: _address, ...payloadWithoutAddress } = validPayload

        const response = await server.inject({
          method: 'POST',
          url: '/v1/overseas-sites',
          ...asServiceMaintainer(),
          payload: payloadWithoutAddress
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 when address.line1 is missing', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/v1/overseas-sites',
          ...asServiceMaintainer(),
          payload: {
            ...validPayload,
            address: { townOrCity: 'Mumbai' }
          }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 when address.townOrCity is missing', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/v1/overseas-sites',
          ...asServiceMaintainer(),
          payload: {
            ...validPayload,
            address: { line1: '123 Industrial Avenue' }
          }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })
    })

    describe('authorisation', () => {
      it('returns 401 when not authenticated', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/v1/overseas-sites',
          payload: validPayload
        })

        expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
      })

      it('returns 403 when authenticated as standard user', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/v1/overseas-sites',
          ...asStandardUser({ linkedOrgId: 'org-123' }),
          payload: validPayload
        })

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
      })
    })

    describe('error handling', () => {
      it('re-throws Boom errors from repository', async () => {
        const Boom = await import('@hapi/boom')
        overseasSitesRepository.create.mockRejectedValueOnce(
          Boom.default.badRequest('Invalid data')
        )

        const response = await server.inject({
          method: 'POST',
          url: '/v1/overseas-sites',
          ...asServiceMaintainer(),
          payload: validPayload
        })

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      })

      it('returns 500 for unexpected errors', async () => {
        overseasSitesRepository.create.mockRejectedValueOnce(
          new Error('Database connection failed')
        )

        const response = await server.inject({
          method: 'POST',
          url: '/v1/overseas-sites',
          ...asServiceMaintainer(),
          payload: validPayload
        })

        expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      })
    })
  })
})
