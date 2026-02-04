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
import { PRN_STATUS } from '#l-packaging-recycling-notes/domain/model.js'
import {
  MATERIAL,
  NATION,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { PrnNumberConflictError } from '#l-packaging-recycling-notes/repository/mongodb.js'
import { packagingRecyclingNotesUpdateStatusPath } from './status.js'

const organisationId = 'org-123'
const registrationId = 'reg-456'
const accreditationId = 'acc-789'
const prnId = '507f1f77bcf86cd799439011'

const createMockPrn = (overrides = {}) => ({
  id: prnId,
  issuedByOrganisation: organisationId,
  issuedByAccreditation: accreditationId,
  issuedToOrganisation: 'producer-org-789',
  tonnage: 100,
  material: MATERIAL.PLASTIC,
  nation: NATION.ENGLAND,
  wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
  isExport: false,
  issuerNotes: 'Test notes',
  status: {
    currentStatus: PRN_STATUS.DRAFT,
    history: [{ status: PRN_STATUS.DRAFT, updatedAt: new Date() }]
  },
  createdAt: new Date(),
  createdBy: 'user-123',
  updatedAt: new Date(),
  ...overrides
})

const createInMemoryPackagingRecyclingNotesRepository = (initialPrns = []) => {
  const store = new Map(initialPrns.map((prn) => [prn.id, { ...prn }]))

  return () => ({
    create: vi.fn(async (prn) => {
      const id = `prn-${Date.now()}`
      const created = { ...prn, id }
      store.set(id, created)
      return created
    }),
    findById: vi.fn(async (id) => {
      const prn = store.get(id)
      return prn ? { ...prn } : null
    }),
    updateStatus: vi.fn(
      async ({ id, status, updatedBy, updatedAt, prnNumber }) => {
        const prn = store.get(id)
        if (!prn) return null

        prn.status.currentStatus = status
        prn.status.history.push({ status, updatedAt, updatedBy })
        prn.updatedAt = updatedAt
        if (prnNumber) {
          prn.prnNumber = prnNumber
        }
        store.set(id, prn)

        return { ...prn }
      }
    )
  })
}

describe(`${packagingRecyclingNotesUpdateStatusPath} route`, () => {
  setupAuthContext()

  describe('when feature flag is enabled', () => {
    let server
    let lumpyPackagingRecyclingNotesRepository
    let wasteBalancesRepository
    const mockPrn = createMockPrn()

    const createMockWasteBalance = (overrides = {}) => ({
      id: 'balance-123',
      organisationId,
      accreditationId,
      amount: 500,
      availableAmount: 500,
      transactions: [],
      version: 1,
      schemaVersion: 1,
      ...overrides
    })

    beforeAll(async () => {
      lumpyPackagingRecyclingNotesRepository =
        createInMemoryPackagingRecyclingNotesRepository([mockPrn])()

      wasteBalancesRepository = {
        findByAccreditationId: vi
          .fn()
          .mockResolvedValue(createMockWasteBalance()),
        findByAccreditationIds: vi.fn(),
        deductAvailableBalanceForPrnCreation: vi.fn().mockResolvedValue({}),
        deductTotalBalanceForPrnIssue: vi.fn().mockResolvedValue({})
      }

      server = await createTestServer({
        repositories: {
          lumpyPackagingRecyclingNotesRepository: () =>
            lumpyPackagingRecyclingNotesRepository,
          wasteBalancesRepository: () => wasteBalancesRepository
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
      it('returns 200 and calls updateStatus with correct parameters', async () => {
        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}/status`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(response.statusCode).toBe(StatusCodes.OK)

        const body = JSON.parse(response.payload)
        expect(body.id).toBe(prnId)
        expect(body.status).toBe(PRN_STATUS.AWAITING_AUTHORISATION)

        expect(
          lumpyPackagingRecyclingNotesRepository.updateStatus
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            id: prnId,
            status: PRN_STATUS.AWAITING_AUTHORISATION
          })
        )
      })

      it('does not generate PRN number for non-issuing transitions', async () => {
        lumpyPackagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          createMockPrn()
        )

        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}/status`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        const callArgs =
          lumpyPackagingRecyclingNotesRepository.updateStatus.mock.calls[0][0]
        expect(callArgs).not.toHaveProperty('prnNumber')
      })
    })

    describe('PRN number generation', () => {
      it('generates PRN number when issuing (transitioning to awaiting_acceptance)', async () => {
        const awaitingAuthPrn = createMockPrn({
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: [
              {
                status: PRN_STATUS.AWAITING_AUTHORISATION,
                updatedAt: new Date()
              }
            ]
          }
        })

        lumpyPackagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          awaitingAuthPrn
        )

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}/status`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.AWAITING_ACCEPTANCE }
        })

        expect(response.statusCode).toBe(StatusCodes.OK)

        expect(
          lumpyPackagingRecyclingNotesRepository.updateStatus
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            prnNumber: expect.stringMatching(/^ER26\d{5}$/)
          })
        )
      })

      it('generates PRN number with X for exporter', async () => {
        const exporterPrn = createMockPrn({
          isExport: true,
          wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: [
              {
                status: PRN_STATUS.AWAITING_AUTHORISATION,
                updatedAt: new Date()
              }
            ]
          }
        })

        lumpyPackagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          exporterPrn
        )

        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}/status`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.AWAITING_ACCEPTANCE }
        })

        expect(
          lumpyPackagingRecyclingNotesRepository.updateStatus
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            prnNumber: expect.stringMatching(/^EX26\d{5}$/)
          })
        )
      })

      it('uses nation code for agency prefix', async () => {
        const walesPrn = createMockPrn({
          nation: NATION.WALES,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: [
              {
                status: PRN_STATUS.AWAITING_AUTHORISATION,
                updatedAt: new Date()
              }
            ]
          }
        })

        lumpyPackagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          walesPrn
        )

        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}/status`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.AWAITING_ACCEPTANCE }
        })

        expect(
          lumpyPackagingRecyclingNotesRepository.updateStatus
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            prnNumber: expect.stringMatching(/^WR26\d{5}$/)
          })
        )
      })

      it('returns PRN number in response when issuing', async () => {
        const awaitingAuthPrn = createMockPrn({
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: [
              {
                status: PRN_STATUS.AWAITING_AUTHORISATION,
                updatedAt: new Date()
              }
            ]
          }
        })

        lumpyPackagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          awaitingAuthPrn
        )

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}/status`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.AWAITING_ACCEPTANCE }
        })

        const body = JSON.parse(response.payload)
        expect(body.prnNumber).toMatch(/^ER26\d{5}$/)
      })

      it('retries with suffix when PRN number collision occurs', async () => {
        const awaitingAuthPrn = createMockPrn({
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: [
              {
                status: PRN_STATUS.AWAITING_AUTHORISATION,
                updatedAt: new Date()
              }
            ]
          }
        })

        lumpyPackagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          awaitingAuthPrn
        )

        // First call throws conflict, second succeeds
        lumpyPackagingRecyclingNotesRepository.updateStatus
          .mockRejectedValueOnce(new PrnNumberConflictError('ER2612345'))
          .mockResolvedValueOnce({
            ...awaitingAuthPrn,
            prnNumber: 'ER2612345A',
            status: {
              currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
              history: awaitingAuthPrn.status.history
            }
          })

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}/status`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.AWAITING_ACCEPTANCE }
        })

        expect(response.statusCode).toBe(StatusCodes.OK)

        // Should have been called twice - once without suffix, once with A
        expect(
          lumpyPackagingRecyclingNotesRepository.updateStatus
        ).toHaveBeenCalledTimes(2)

        // Second call should have suffix A
        const secondCall =
          lumpyPackagingRecyclingNotesRepository.updateStatus.mock.calls[1][0]
        expect(secondCall.prnNumber).toMatch(/^ER26\d{5}A$/)
      })

      it('continues through suffixes until one succeeds', async () => {
        const awaitingAuthPrn = createMockPrn({
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: [
              {
                status: PRN_STATUS.AWAITING_AUTHORISATION,
                updatedAt: new Date()
              }
            ]
          }
        })

        lumpyPackagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          awaitingAuthPrn
        )

        // First three calls throw conflict, fourth succeeds
        lumpyPackagingRecyclingNotesRepository.updateStatus
          .mockRejectedValueOnce(new PrnNumberConflictError('ER2612345'))
          .mockRejectedValueOnce(new PrnNumberConflictError('ER2612345A'))
          .mockRejectedValueOnce(new PrnNumberConflictError('ER2612345B'))
          .mockResolvedValueOnce({
            ...awaitingAuthPrn,
            prnNumber: 'ER2612345C',
            status: {
              currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
              history: awaitingAuthPrn.status.history
            }
          })

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}/status`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.AWAITING_ACCEPTANCE }
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(
          lumpyPackagingRecyclingNotesRepository.updateStatus
        ).toHaveBeenCalledTimes(4)

        // Fourth call should have suffix C
        const fourthCall =
          lumpyPackagingRecyclingNotesRepository.updateStatus.mock.calls[3][0]
        expect(fourthCall.prnNumber).toMatch(/^ER26\d{5}C$/)
      })

      it('returns 500 when all suffix attempts are exhausted', async () => {
        const awaitingAuthPrn = createMockPrn({
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: [
              {
                status: PRN_STATUS.AWAITING_AUTHORISATION,
                updatedAt: new Date()
              }
            ]
          }
        })

        lumpyPackagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          awaitingAuthPrn
        )

        // All 27 attempts (no suffix + A-Z) throw conflict
        lumpyPackagingRecyclingNotesRepository.updateStatus.mockRejectedValue(
          new PrnNumberConflictError('ER2612345')
        )

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}/status`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.AWAITING_ACCEPTANCE }
        })

        expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)

        // Should have tried 27 times (no suffix + A through Z)
        expect(
          lumpyPackagingRecyclingNotesRepository.updateStatus
        ).toHaveBeenCalledTimes(27)
      })

      it('returns 500 when non-collision error occurs during retry', async () => {
        const awaitingAuthPrn = createMockPrn({
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: [
              {
                status: PRN_STATUS.AWAITING_AUTHORISATION,
                updatedAt: new Date()
              }
            ]
          }
        })

        lumpyPackagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          awaitingAuthPrn
        )

        // First call throws conflict, second throws database error
        lumpyPackagingRecyclingNotesRepository.updateStatus
          .mockRejectedValueOnce(new PrnNumberConflictError('ER2612345'))
          .mockRejectedValueOnce(new Error('Database connection lost'))

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}/status`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.AWAITING_ACCEPTANCE }
        })

        expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)

        // Should have only tried twice before non-collision error
        expect(
          lumpyPackagingRecyclingNotesRepository.updateStatus
        ).toHaveBeenCalledTimes(2)
      })

      it('sets updatedBy to the authenticated user ID', async () => {
        const userId = 'specific-test-user-id'

        lumpyPackagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          createMockPrn()
        )

        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}/status`,
          ...asStandardUser({ linkedOrgId: organisationId, id: userId }),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(
          lumpyPackagingRecyclingNotesRepository.updateStatus
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            updatedBy: userId
          })
        )
      })

      it('falls back to unknown when credentials have no id', async () => {
        lumpyPackagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          createMockPrn()
        )

        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}/status`,
          auth: {
            strategy: 'access-token',
            credentials: {
              scope: ['standard_user'],
              linkedOrgId: organisationId
            }
          },
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(
          lumpyPackagingRecyclingNotesRepository.updateStatus
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            updatedBy: 'unknown'
          })
        )
      })
    })

    describe('error handling', () => {
      it('returns 404 when PRN not found', async () => {
        const nonExistentId = '507f1f77bcf86cd799439099'

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${nonExistentId}/status`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('returns 404 when PRN belongs to different organisation', async () => {
        const differentOrgId = 'different-org'

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${differentOrgId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}/status`,
          ...asStandardUser({ linkedOrgId: differentOrgId }),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('returns 400 for invalid status transition', async () => {
        // Create a PRN that's already in CREATED status
        const createdPrnId = '507f1f77bcf86cd799439022'
        const createdPrn = createMockPrn({
          id: createdPrnId,
          status: {
            currentStatus: PRN_STATUS.ACCEPTED,
            history: [{ status: PRN_STATUS.ACCEPTED, updatedAt: new Date() }]
          }
        })

        // Add to repository
        lumpyPackagingRecyclingNotesRepository.findById.mockImplementation(
          async (id) => {
            if (id === createdPrnId) return createdPrn
            if (id === prnId) return mockPrn
            return null
          }
        )

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${createdPrnId}/status`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.DRAFT }
        })

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
        expect(response.payload).toContain('Invalid status transition')
      })

      it('returns 400 when PRN has unknown current status', async () => {
        const unknownStatusPrnId = '507f1f77bcf86cd799439033'
        const unknownStatusPrn = createMockPrn({
          id: unknownStatusPrnId,
          status: {
            currentStatus: 'unknown_status',
            history: [{ status: 'unknown_status', updatedAt: new Date() }]
          }
        })

        lumpyPackagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          unknownStatusPrn
        )

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${unknownStatusPrnId}/status`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
        expect(response.payload).toContain('Invalid status transition')
      })

      it('returns 422 for invalid PRN id format', async () => {
        const invalidId = 'invalid-id'

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${invalidId}/status`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 for invalid status value', async () => {
        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}/status`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: 'invalid_status' }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 500 when updateStatus returns null', async () => {
        // Reset PRN to draft status for this test
        lumpyPackagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          createMockPrn()
        )
        lumpyPackagingRecyclingNotesRepository.updateStatus.mockResolvedValueOnce(
          null
        )

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}/status`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      })

      it('returns 500 when repository throws non-Boom error', async () => {
        // Reset PRN to draft status for this test
        lumpyPackagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          createMockPrn()
        )
        lumpyPackagingRecyclingNotesRepository.updateStatus.mockRejectedValueOnce(
          new Error('Database connection failed')
        )

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}/status`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      })
    })
  })

  describe('waste balance deduction on PRN creation', () => {
    let server
    let lumpyPackagingRecyclingNotesRepository
    let wasteBalancesRepository
    const mockPrn = createMockPrn({ tonnage: 50.5 })

    const createMockWasteBalance = (overrides = {}) => ({
      id: 'balance-123',
      organisationId,
      accreditationId,
      amount: 500,
      availableAmount: 500,
      transactions: [],
      version: 1,
      schemaVersion: 1,
      ...overrides
    })

    beforeAll(async () => {
      lumpyPackagingRecyclingNotesRepository =
        createInMemoryPackagingRecyclingNotesRepository([mockPrn])()

      wasteBalancesRepository = {
        findByAccreditationId: vi
          .fn()
          .mockResolvedValue(createMockWasteBalance()),
        findByAccreditationIds: vi.fn(),
        deductAvailableBalanceForPrnCreation: vi.fn().mockResolvedValue({}),
        deductTotalBalanceForPrnIssue: vi.fn().mockResolvedValue({})
      }

      server = await createTestServer({
        repositories: {
          lumpyPackagingRecyclingNotesRepository: () =>
            lumpyPackagingRecyclingNotesRepository,
          wasteBalancesRepository: () => wasteBalancesRepository
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

    it('deducts tonnage from available balance when transitioning to awaiting_authorisation', async () => {
      const balance = createMockWasteBalance()
      wasteBalancesRepository.findByAccreditationId.mockResolvedValueOnce(
        balance
      )
      wasteBalancesRepository.deductAvailableBalanceForPrnCreation.mockResolvedValueOnce(
        undefined
      )
      lumpyPackagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
        mockPrn
      )

      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}/status`,
        ...asStandardUser({ linkedOrgId: organisationId }),
        payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(
        wasteBalancesRepository.deductAvailableBalanceForPrnCreation
      ).toHaveBeenCalledWith({
        accreditationId,
        organisationId,
        prnId,
        tonnage: 50.5,
        userId: expect.any(String)
      })
    })

    it('does not deduct balance for non-creation transitions', async () => {
      const awaitingAuthPrn = createMockPrn({
        status: {
          currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          history: [
            {
              status: PRN_STATUS.AWAITING_AUTHORISATION,
              updatedAt: new Date()
            }
          ]
        }
      })

      lumpyPackagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
        awaitingAuthPrn
      )

      await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}/status`,
        ...asStandardUser({ linkedOrgId: organisationId }),
        payload: { status: PRN_STATUS.AWAITING_ACCEPTANCE }
      })

      expect(
        wasteBalancesRepository.deductAvailableBalanceForPrnCreation
      ).not.toHaveBeenCalled()
    })

    it('returns 400 when no waste balance exists', async () => {
      wasteBalancesRepository.findByAccreditationId.mockResolvedValueOnce(null)
      lumpyPackagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
        createMockPrn()
      )

      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}/status`,
        ...asStandardUser({ linkedOrgId: organisationId }),
        payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      expect(
        wasteBalancesRepository.deductAvailableBalanceForPrnCreation
      ).not.toHaveBeenCalled()
    })

    it('returns 500 when waste balance deduction fails', async () => {
      const balance = createMockWasteBalance()
      wasteBalancesRepository.findByAccreditationId.mockResolvedValueOnce(
        balance
      )
      wasteBalancesRepository.deductAvailableBalanceForPrnCreation.mockRejectedValueOnce(
        new Error('Database write failed')
      )
      lumpyPackagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
        createMockPrn()
      )

      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}/status`,
        ...asStandardUser({ linkedOrgId: organisationId }),
        payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
      })

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    })
  })

  describe('when feature flag is disabled', () => {
    let server

    beforeAll(async () => {
      server = await createTestServer({
        repositories: {
          lumpyPackagingRecyclingNotesRepository: () => ({
            findById: vi.fn(),
            create: vi.fn(),
            updateStatus: vi.fn()
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

    it('returns 404', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}/status`,
        ...asStandardUser({ linkedOrgId: organisationId }),
        payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})
