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
import { createTestServer } from '#test/create-test-server.js'
import { asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { MATERIAL, WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { packagingRecyclingNotesCreatePath } from './post.js'

const organisationId = 'org-123'
const registrationId = 'reg-456'
const accreditationId = 'acc-789'

const validPayload = {
  issuedToOrganisation: {
    id: 'producer-org-789',
    name: 'Producer Org',
    tradingName: 'Producer Trading'
  },
  tonnage: 100,
  material: MATERIAL.PLASTIC
}

const createInMemoryPackagingRecyclingNotesRepository = () => {
  const store = new Map()

  return () => ({
    create: vi.fn(async (prn) => {
      const id = `prn-${Date.now()}`
      const created = { ...prn, id }
      store.set(id, created)
      return created
    }),
    findById: vi.fn(async (id) => store.get(id) || null)
  })
}

describe(`${packagingRecyclingNotesCreatePath} route`, () => {
  setupAuthContext()

  describe('when feature flag is enabled', () => {
    let server
    let lumpyPackagingRecyclingNotesRepository
    let organisationsRepository

    beforeAll(async () => {
      lumpyPackagingRecyclingNotesRepository =
        createInMemoryPackagingRecyclingNotesRepository()()

      organisationsRepository = {
        findAccreditationById: vi.fn(async () => ({
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          submittedToRegulator: 'ea'
        }))
      }

      server = await createTestServer({
        repositories: {
          lumpyPackagingRecyclingNotesRepository: () =>
            lumpyPackagingRecyclingNotesRepository,
          organisationsRepository: () => organisationsRepository
        },
        featureFlags: createInMemoryFeatureFlags({
          lumpyPackagingRecyclingNotes: true
        })
      })

      await server.initialize()
    })

    afterEach(() => {
      vi.clearAllMocks()
    })

    afterAll(async () => {
      await server.stop()
    })

    describe('successful requests', () => {
      it('returns 201 with created PRN details', async () => {
        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: validPayload
        })

        expect(response.statusCode).toBe(StatusCodes.CREATED)

        const body = JSON.parse(response.payload)
        expect(body.id).toBeDefined()
        expect(body.tonnage).toBe(validPayload.tonnage)
        expect(body.material).toBe(validPayload.material)
        expect(body.issuedToOrganisation).toStrictEqual(
          validPayload.issuedToOrganisation
        )
        expect(body.status).toBe(PRN_STATUS.DRAFT)
        expect(body.createdAt).toBeDefined()
        expect(body.processToBeUsed).toBe('R3') // plastic uses R3
      })

      it('creates PRN with correct organisation and registration', async () => {
        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: validPayload
        })

        expect(
          lumpyPackagingRecyclingNotesRepository.create
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            organisationId,
            accreditationId,
            issuedToOrganisation: validPayload.issuedToOrganisation
          })
        )
      })

      it('creates PRN with draft status and history', async () => {
        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: validPayload
        })

        expect(
          lumpyPackagingRecyclingNotesRepository.create
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            status: expect.objectContaining({
              currentStatus: PRN_STATUS.DRAFT,
              history: expect.arrayContaining([
                expect.objectContaining({
                  status: PRN_STATUS.DRAFT
                })
              ])
            })
          })
        )
      })

      it('sets createdBy and updatedBy to the authenticated user ID', async () => {
        const userId = 'specific-test-user-id'

        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          auth: {
            strategy: 'access-token',
            credentials: {
              scope: ['standard_user'],
              id: userId,
              email: 'test@example.com',
              linkedOrgId: organisationId
            }
          },
          payload: validPayload
        })

        expect(
          lumpyPackagingRecyclingNotesRepository.create
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            createdBy: expect.objectContaining({ id: userId }),
            status: expect.objectContaining({
              history: expect.arrayContaining([
                expect.objectContaining({
                  updatedBy: userId
                })
              ])
            })
          })
        )
      })

      it('falls back to unknown when credentials have no id', async () => {
        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          auth: {
            strategy: 'access-token',
            credentials: {
              scope: ['standard_user'],
              linkedOrgId: organisationId
            }
          },
          payload: validPayload
        })

        expect(
          lumpyPackagingRecyclingNotesRepository.create
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            createdBy: expect.objectContaining({ id: 'unknown' })
          })
        )
      })

      it('sets isExport to false for reprocessor', async () => {
        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: validPayload
        })

        expect(
          lumpyPackagingRecyclingNotesRepository.create
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            isExport: false
          })
        )
      })

      it('sets isExport to true for exporter', async () => {
        organisationsRepository.findAccreditationById.mockResolvedValueOnce({
          wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
          submittedToRegulator: 'ea'
        })

        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: validPayload
        })

        expect(
          lumpyPackagingRecyclingNotesRepository.create
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            isExport: true
          })
        )
      })

      it('includes issuer notes when provided', async () => {
        const notes = 'Test issuer notes'

        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: {
            ...validPayload,
            notes
          }
        })

        expect(
          lumpyPackagingRecyclingNotesRepository.create
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            notes
          })
        )
      })
    })

    describe('validation errors', () => {
      it('returns 422 when tonnage is missing', async () => {
        const { tonnage: _tonnage, ...payloadWithoutTonnage } = validPayload

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: payloadWithoutTonnage
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 when tonnage is zero', async () => {
        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: {
            ...validPayload,
            tonnage: 0
          }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 when tonnage is negative', async () => {
        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: {
            ...validPayload,
            tonnage: -1
          }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 when tonnage is not an integer', async () => {
        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: {
            ...validPayload,
            tonnage: 10.5
          }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 when material is invalid', async () => {
        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: {
            ...validPayload,
            material: 'invalid_material'
          }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 when notes exceeds 200 characters', async () => {
        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: {
            ...validPayload,
            notes: 'a'.repeat(201)
          }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })
    })

    describe('authentication', () => {
      it('returns 401 when not authenticated', async () => {
        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          payload: validPayload
        })

        expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
      })
    })

    describe('error handling', () => {
      it('re-throws Boom errors from repository', async () => {
        const Boom = await import('@hapi/boom')
        lumpyPackagingRecyclingNotesRepository.create.mockRejectedValueOnce(
          Boom.default.notFound('Organisation not found')
        )

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: validPayload
        })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('returns 500 for unexpected errors', async () => {
        lumpyPackagingRecyclingNotesRepository.create.mockRejectedValueOnce(
          new Error('Database connection failed')
        )

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: validPayload
        })

        expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      })
    })
  })

  describe('when feature flag is disabled', () => {
    let server

    beforeAll(async () => {
      server = await createTestServer({
        repositories: {
          lumpyPackagingRecyclingNotesRepository:
            createInMemoryPackagingRecyclingNotesRepository(),
          organisationsRepository: () => ({
            findAccreditationById: vi.fn(async () => ({
              wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
              submittedToRegulator: 'ea'
            }))
          })
        },
        featureFlags: createInMemoryFeatureFlags({
          lumpyPackagingRecyclingNotes: false
        })
      })

      await server.initialize()
    })

    afterAll(async () => {
      await server.stop()
    })

    it('returns 404 when feature flag is disabled', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
        ...asStandardUser({ linkedOrgId: organisationId }),
        payload: validPayload
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})
