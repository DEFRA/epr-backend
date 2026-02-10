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
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
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

describe(`${packagingRecyclingNotesCreatePath} route`, () => {
  setupAuthContext()

  describe('when feature flag is enabled', () => {
    let server
    let lumpyPackagingRecyclingNotesRepository
    let organisationsRepository

    beforeAll(async () => {
      lumpyPackagingRecyclingNotesRepository =
        createInMemoryPackagingRecyclingNotesRepository()()
      vi.spyOn(lumpyPackagingRecyclingNotesRepository, 'create')

      organisationsRepository = {
        findById: vi.fn(async () => ({
          companyDetails: {
            name: 'Test Org',
            tradingName: 'Test Trading'
          }
        })),
        findAccreditationById: vi.fn(async () => ({
          id: accreditationId,
          accreditationNumber: 'ACC-001',
          material: MATERIAL.PLASTIC,
          validFrom: '2026-01-01',
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          submittedToRegulator: 'ea',
          site: {
            address: { line1: '1 Test St', postcode: 'SW1A 1AA' }
          }
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
        expect(body.notes).toBeNull()
        expect(body.isDecemberWaste).toBe(false)
        expect(body.accreditationYear).toBe(2026)
        expect(body.wasteProcessingType).toBe(WASTE_PROCESSING_TYPE.REPROCESSOR)
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
            organisation: expect.objectContaining({ id: organisationId }),
            registrationId,
            accreditation: expect.objectContaining({ id: accreditationId }),
            issuedToOrganisation: validPayload.issuedToOrganisation
          })
        )
      })

      it('creates PRN with draft status, created operation, and history', async () => {
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
              created: expect.objectContaining({
                at: expect.any(Date),
                by: expect.objectContaining({ id: expect.any(String) })
              }),
              history: expect.arrayContaining([
                expect.objectContaining({
                  status: PRN_STATUS.DRAFT,
                  at: expect.any(Date),
                  by: expect.objectContaining({ id: expect.any(String) })
                })
              ])
            })
          })
        )
      })

      it('sets createdBy and updatedBy to the authenticated user', async () => {
        const userId = 'specific-test-user-id'
        const userName = 'Test User'

        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          auth: {
            strategy: 'access-token',
            credentials: {
              scope: ['standard_user'],
              id: userId,
              name: userName,
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
            createdBy: { id: userId, name: userName },
            updatedBy: { id: userId, name: userName },
            status: expect.objectContaining({
              created: expect.objectContaining({
                by: { id: userId, name: userName }
              }),
              history: expect.arrayContaining([
                expect.objectContaining({
                  by: { id: userId, name: userName }
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
          id: accreditationId,
          accreditationNumber: 'ACC-001',
          material: MATERIAL.PLASTIC,
          validFrom: '2026-01-01',
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

      it('snapshots glass recycling process for glass accreditations', async () => {
        organisationsRepository.findAccreditationById.mockResolvedValueOnce({
          id: accreditationId,
          accreditationNumber: 'ACC-001',
          material: MATERIAL.GLASS,
          validFrom: '2026-01-01',
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          submittedToRegulator: 'ea',
          glassRecyclingProcess: ['remelt'],
          site: {
            address: { line1: '123 Glass Lane', postcode: 'GL1 2AB' }
          }
        })

        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { ...validPayload, material: MATERIAL.GLASS }
        })

        expect(
          lumpyPackagingRecyclingNotesRepository.create
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            accreditation: expect.objectContaining({
              material: MATERIAL.GLASS,
              glassRecyclingProcess: 'remelt',
              siteAddress: { line1: '123 Glass Lane', postcode: 'GL1 2AB' }
            })
          })
        )
      })

      it('omits glass recycling process for non-glass accreditations', async () => {
        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: validPayload
        })

        const createArg =
          lumpyPackagingRecyclingNotesRepository.create.mock.calls[0][0]
        expect(createArg.accreditation).not.toHaveProperty(
          'glassRecyclingProcess'
        )
      })

      it('returns 500 when accreditation has no validFrom', async () => {
        organisationsRepository.findAccreditationById.mockResolvedValueOnce({
          id: accreditationId,
          accreditationNumber: 'ACC-001',
          material: MATERIAL.PLASTIC,
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          submittedToRegulator: 'ea'
        })

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: validPayload
        })

        expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      })

      it('succeeds when issuedToOrganisation has null tradingName', async () => {
        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: {
            ...validPayload,
            issuedToOrganisation: {
              id: 'producer-org-789',
              name: 'Producer Org',
              tradingName: null
            }
          }
        })

        expect(response.statusCode).toBe(StatusCodes.CREATED)

        const createArg =
          lumpyPackagingRecyclingNotesRepository.create.mock.calls[0][0]
        expect(createArg.issuedToOrganisation).not.toHaveProperty('tradingName')
      })

      it('should include issuer notes when provided', async () => {
        const notes = 'Test issuer notes'

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: {
            ...validPayload,
            notes
          }
        })

        const body = JSON.parse(response.payload)
        expect(body.notes).toBe(notes)
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
            findById: vi.fn(async () => ({
              companyDetails: {
                name: 'Test Org',
                tradingName: 'Test Trading'
              }
            })),
            findAccreditationById: vi.fn(async () => ({
              id: accreditationId,
              accreditationNumber: 'ACC-001',
              material: MATERIAL.PLASTIC,
              validFrom: '2026-01-01',
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
