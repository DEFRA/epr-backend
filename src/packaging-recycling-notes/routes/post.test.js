import { ObjectId } from 'mongodb'
import { StatusCodes } from 'http-status-codes'

import { createTestServer } from '#test/create-test-server.js'
import { partialMock } from '#test/type-helpers.js'
import { asOperator } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { DECEMBER_WASTE_NOT_DECLARABLE_CODE } from '#packaging-recycling-notes/domain/december-waste-window.js'
import {
  MATERIAL,
  WASTE_PROCESSING_TYPE,
  REPROCESSING_TYPE
} from '#domain/organisations/model.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import {
  buildLedgerEvent,
  buildPrnCreatedEvent
} from '#waste-balances/repository/ledger-test-data.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { createMockLogger } from '#test/mock-logger.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import {
  accreditation,
  exporter,
  granted,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'

const { buildOrganisation } = createOrganisationBuilders()

/** @import { StatusHistoryEntry } from '#domain/organisations/accreditation.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */

const organisationId = new ObjectId().toString()
const registrationId = new ObjectId().toString()
const accreditationId = new ObjectId().toString()
const { orgId } = buildOrganisation()

const SEED_BALANCE = { amount: 500, availableAmount: 500 }

/**
 * An in-memory stream seeded with one summary-log submission, opening the
 * ledger at the given balance so the create route's pre-check resolves
 * against it. Passing `null` leaves the ledger absent, which resolves to zero
 * available.
 *
 * @param {{ amount: number, availableAmount: number, decemberAmount?: number, decemberAvailableAmount?: number } | null} [closingBalance]
 */
const seedStream = (closingBalance = SEED_BALANCE) =>
  createInMemoryLedgerRepository(
    closingBalance
      ? [
          partialMock(
            buildLedgerEvent({
              organisationId,
              registrationId,
              accreditationId,
              number: 1,
              payload: {
                summaryLogId: 'log-1',
                creditTotal: closingBalance.amount
              },
              openingBalance: { amount: 0, availableAmount: 0 },
              closingBalance
            })
          )
        ]
      : []
  )()

const outputReprocessorAccreditation = {
  material: MATERIAL.PLASTIC,
  glassRecyclingProcess: undefined,
  validFrom: '2026-01-01',
  wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
  reprocessingType: REPROCESSING_TYPE.OUTPUT,
  site: { address: { line1: '1 Test St', postcode: 'SW1A 1AA' } }
}

const exporterAccreditation = {
  wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
  reprocessingType: undefined
}

/** @type {StatusHistoryEntry[]} */
const cancelledHistory = [
  { status: 'created', updatedAt: new Date('2025-12-01') },
  { status: 'approved', updatedAt: new Date('2026-01-01') },
  { status: 'cancelled', updatedAt: new Date('2026-03-01') }
]

const validPayload = {
  issuedToOrganisation: {
    id: 'producer-org-789',
    name: 'Producer Org',
    tradingName: 'Producer Trading'
  },
  tonnage: 100
}

describe('POST /organisations/{organisationNumber}/registrations/{registrationNumber}/accreditations/{year}/packaging-recycling-notes', () => {
  setupAuthContext()

  let server
  let packagingRecyclingNotesRepository
  /** @type {OrganisationsRepository} */
  let organisationsRepository
  let ledgerRepository
  /** @type {string} */
  let url
  /** @type {string} */
  let registrationNumber

  /**
   * Serves the organisation with one accreditation, an output reprocessor's
   * unless overridden, at the URL its natural keys name.
   *
   * @param {object} [overrides]
   */
  const useAccreditation = (overrides = {}) => {
    const accredited = accreditation({
      ...outputReprocessorAccreditation,
      id: accreditationId,
      ...overrides
    })
    const registration = (
      accredited.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER
        ? exporter
        : reprocessor
    )({ id: registrationId, accreditationId })
    const organisation = buildOrganisation({
      id: organisationId,
      orgId,
      statusHistory: [
        { status: 'approved', updatedAt: new Date('2026-01-01T00:00:00.000Z') }
      ],
      registrations: [registration],
      accreditations: [accredited]
    })
    organisationsRepository = createInMemoryOrganisationsRepository([
      partialMock(organisation)
    ])()
    const year = new Date(/** @type {string} */ (accredited.validFrom))
    registrationNumber = registration.registrationNumber
    url = `/organisations/${orgId}/registrations/${registrationNumber}/accreditations/${year.getUTCFullYear()}/packaging-recycling-notes`
  }

  beforeAll(async () => {
    packagingRecyclingNotesRepository =
      createInMemoryPackagingRecyclingNotesRepository()(createMockLogger())
    vi.spyOn(packagingRecyclingNotesRepository, 'create')

    server = await createTestServer({
      repositories: {
        packagingRecyclingNotesRepository: () =>
          packagingRecyclingNotesRepository,
        organisationsRepository: () => organisationsRepository,
        ledgerRepository: () => ledgerRepository
      }
    })

    await server.initialize()
  })

  beforeEach(() => {
    vi.setSystemTime(new Date('2026-10-01T12:00:00.000Z'))
    useAccreditation()
    ledgerRepository = seedStream()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  afterAll(async () => {
    await server.stop()
  })

  /**
   * @param {object} [payload]
   * @param {object} [auth]
   */
  const createPrn = (payload = validPayload, auth = asOperator()) =>
    server.inject({ method: 'POST', url, ...auth, payload })

  describe('successful requests', () => {
    it('returns 201 with created PRN details', async () => {
      const response = await createPrn()

      expect(response.statusCode).toBe(StatusCodes.CREATED)

      const body = JSON.parse(response.payload)
      expect(body.id).toBeDefined()
      expect(body.tonnage).toBe(validPayload.tonnage)
      expect(body.issuedToOrganisation).toStrictEqual(
        validPayload.issuedToOrganisation
      )
      expect(body.status.current).toBe(PRN_STATUS.DRAFT)
      expect(body.createdAt).toBeDefined()
      expect(body.processToBeUsed).toBe('R3') // plastic uses R3
      expect(body).not.toHaveProperty('notes')
      expect(body.isDecemberWaste).toBe(false)
      expect(body.obligationYear).toBe(2026)
      expect(body.issuer.registration.accreditation).toMatchObject({
        accreditationYear: 2026,
        material: MATERIAL.PLASTIC,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR
      })
    })

    it('persists isDecemberWaste true when submitted by an output reprocessor inside the window', async () => {
      vi.setSystemTime(new Date('2026-12-15T12:00:00.000Z'))

      const response = await createPrn({
        ...validPayload,
        isDecemberWaste: true
      })

      expect(response.statusCode).toBe(StatusCodes.CREATED)
      const body = JSON.parse(response.payload)
      expect(body.isDecemberWaste).toBe(true)
      expect(packagingRecyclingNotesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ isDecemberWaste: true })
      )
    })

    it('persists isDecemberWaste false when submitted explicitly', async () => {
      const response = await createPrn({
        ...validPayload,
        isDecemberWaste: false
      })

      expect(response.statusCode).toBe(StatusCodes.CREATED)
      expect(JSON.parse(response.payload).isDecemberWaste).toBe(false)
    })

    it('creates PRN with correct organisation and registration', async () => {
      await createPrn()

      expect(packagingRecyclingNotesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organisation: expect.objectContaining({ id: organisationId }),
          registrationId,
          accreditation: expect.objectContaining({ id: accreditationId }),
          obligationYear: 2026,
          issuedToOrganisation: validPayload.issuedToOrganisation
        })
      )
    })

    it('stores the organisation and registration numbers beside their ids', async () => {
      const response = await createPrn()

      const stored = await packagingRecyclingNotesRepository.findById(
        JSON.parse(response.payload).id
      )
      expect(stored.organisation).toMatchObject({
        id: organisationId,
        organisationNumber: String(orgId)
      })
      expect(stored).toMatchObject({
        registrationId,
        registration: { registrationNumber }
      })
    })

    it('sets obligationYear from the accreditation year', async () => {
      vi.setSystemTime(new Date('2027-03-01T12:00:00.000Z'))
      useAccreditation({ validFrom: '2027-01-01', validTo: '2027-12-31' })

      await createPrn()

      expect(packagingRecyclingNotesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ obligationYear: 2027 })
      )
    })

    it('creates PRN with draft status and history but no created operation', async () => {
      await createPrn()

      const createArg =
        packagingRecyclingNotesRepository.create.mock.calls[0][0]
      expect(createArg.status.currentStatus).toBe(PRN_STATUS.DRAFT)
      expect(createArg.status).not.toHaveProperty('created')
      expect(createArg.status.history).toStrictEqual([
        expect.objectContaining({
          status: PRN_STATUS.DRAFT,
          at: expect.any(Date),
          by: expect.objectContaining({ id: expect.any(String) })
        })
      ])
    })

    it('sets createdBy and updatedBy to the authenticated user', async () => {
      const userId = 'specific-test-user-id'
      const userName = 'Test User'

      await createPrn(
        validPayload,
        asOperator({ id: userId, name: userName, email: 'test@example.com' })
      )

      expect(packagingRecyclingNotesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          createdBy: { id: userId, name: userName },
          updatedBy: { id: userId, name: userName },
          status: expect.objectContaining({
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
      await createPrn(validPayload, {
        auth: {
          strategy: 'access-token',
          credentials: { scope: [SCOPES.organisationWrite] }
        }
      })

      expect(packagingRecyclingNotesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          createdBy: expect.objectContaining({ id: 'unknown' })
        })
      )
    })

    it('sets isExport to false for reprocessor', async () => {
      await createPrn()

      expect(packagingRecyclingNotesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ isExport: false })
      )
    })

    it('sets isExport to true for exporter', async () => {
      useAccreditation(exporterAccreditation)

      await createPrn()

      expect(packagingRecyclingNotesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ isExport: true })
      )
    })

    it('snapshots glass recycling process for glass accreditations', async () => {
      useAccreditation({
        material: MATERIAL.GLASS,
        glassRecyclingProcess: ['glass_re_melt'],
        site: { address: { line1: '123 Glass Lane', postcode: 'GL1 2AB' } }
      })

      await createPrn()

      expect(packagingRecyclingNotesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          accreditation: expect.objectContaining({
            material: MATERIAL.GLASS,
            glassRecyclingProcess: 'glass_re_melt',
            siteAddress: { line1: '123 Glass Lane', postcode: 'GL1 2AB' }
          })
        })
      )
    })

    it('omits glass recycling process for non-glass accreditations', async () => {
      await createPrn()

      const createArg =
        packagingRecyclingNotesRepository.create.mock.calls[0][0]
      expect(createArg.accreditation).not.toHaveProperty(
        'glassRecyclingProcess'
      )
    })

    it('accepts registrationType on issuedToOrganisation', async () => {
      const response = await createPrn({
        ...validPayload,
        issuedToOrganisation: {
          ...validPayload.issuedToOrganisation,
          registrationType: 'LARGE_PRODUCER'
        }
      })

      expect(response.statusCode).toBe(StatusCodes.CREATED)

      const createArg =
        packagingRecyclingNotesRepository.create.mock.calls[0][0]
      expect(createArg.issuedToOrganisation.registrationType).toBe(
        'LARGE_PRODUCER'
      )
    })

    it('succeeds when issuedToOrganisation has null tradingName', async () => {
      const response = await createPrn({
        ...validPayload,
        issuedToOrganisation: {
          id: 'producer-org-789',
          name: 'Producer Org',
          tradingName: null
        }
      })

      expect(response.statusCode).toBe(StatusCodes.CREATED)

      const createArg =
        packagingRecyclingNotesRepository.create.mock.calls[0][0]
      expect(createArg.issuedToOrganisation).not.toHaveProperty('tradingName')
    })

    it('omits notes key from stored data when no notes provided', async () => {
      await createPrn()

      const createArg =
        packagingRecyclingNotesRepository.create.mock.calls[0][0]
      expect(createArg).not.toHaveProperty('notes')
    })

    it('should include issuer notes when provided', async () => {
      const notes = 'Test issuer notes'

      const response = await createPrn({ ...validPayload, notes })

      expect(JSON.parse(response.payload).notes).toBe(notes)
    })
  })

  describe('validation errors', () => {
    const { tonnage: _tonnage, ...payloadWithoutTonnage } = validPayload

    it.each([
      ['tonnage is missing', payloadWithoutTonnage],
      ['tonnage is zero', { ...validPayload, tonnage: 0 }],
      ['tonnage is negative', { ...validPayload, tonnage: -1 }],
      ['tonnage is not an integer', { ...validPayload, tonnage: 10.5 }],
      [
        'notes exceeds 200 characters',
        { ...validPayload, notes: 'a'.repeat(201) }
      ],
      [
        'isDecemberWaste is not a boolean',
        { ...validPayload, isDecemberWaste: 'yes' }
      ]
    ])('returns 422 when %s', async (_, payload) => {
      const response = await createPrn(payload)

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })

  describe('accreditation status', () => {
    it('returns 403 and does not create a PRN when the accreditation is cancelled', async () => {
      useAccreditation({ statusHistory: cancelledHistory })

      const response = await createPrn()

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
      expect(JSON.parse(response.payload).message).toBe(
        'Cannot create a PRN on a cancelled accreditation'
      )
      expect(packagingRecyclingNotesRepository.create).not.toHaveBeenCalled()
    })

    it('creates a PRN once the accreditation is approved again', async () => {
      useAccreditation({
        statusHistory: [
          ...cancelledHistory,
          { status: 'approved', updatedAt: new Date('2026-04-01') }
        ]
      })

      const response = await createPrn()

      expect(response.statusCode).toBe(StatusCodes.CREATED)
    })

    it('creates a PRN when the accreditation is suspended', async () => {
      useAccreditation({ statusHistory: granted('suspended') })

      const response = await createPrn()

      expect(response.statusCode).toBe(StatusCodes.CREATED)
    })
  })

  describe('relevant year', () => {
    it('should create a PRN on the last instant of 31 January after the year', async () => {
      vi.setSystemTime(new Date('2027-01-31T23:59:59.999Z'))

      const response = await createPrn()

      expect(response.statusCode).toBe(StatusCodes.CREATED)
    })

    it('should return 409 and create no PRN once the year has closed', async () => {
      vi.setSystemTime(new Date('2027-02-01T00:00:00.000Z'))

      const response = await createPrn()

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      expect(JSON.parse(response.payload).code).toBe('RELEVANT_YEAR_CLOSED')
      expect(packagingRecyclingNotesRepository.create).not.toHaveBeenCalled()
    })
  })

  describe('waste balance validation', () => {
    it('returns 409 and creates no draft when tonnage exceeds the available balance', async () => {
      ledgerRepository = seedStream({ amount: 50, availableAmount: 50 })

      const response = await createPrn({ ...validPayload, tonnage: 51 })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      expect(response.payload).toContain('Insufficient available waste balance')
      expect(JSON.parse(response.payload).code).toBe(
        'INSUFFICIENT_AVAILABLE_BALANCE'
      )
      expect(packagingRecyclingNotesRepository.create).not.toHaveBeenCalled()
    })

    it('creates the draft when tonnage equals the available balance', async () => {
      ledgerRepository = seedStream({ amount: 100, availableAmount: 100 })

      const response = await createPrn({ ...validPayload, tonnage: 100 })

      expect(response.statusCode).toBe(StatusCodes.CREATED)
      expect(packagingRecyclingNotesRepository.create).toHaveBeenCalled()
    })

    it('returns 409 for an exporter (PERN) journey when tonnage exceeds the balance', async () => {
      useAccreditation(exporterAccreditation)
      ledgerRepository = seedStream({ amount: 50, availableAmount: 50 })

      const response = await createPrn({ ...validPayload, tonnage: 51 })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      expect(response.payload).toContain('Insufficient available waste balance')
      expect(JSON.parse(response.payload).code).toBe(
        'INSUFFICIENT_AVAILABLE_BALANCE'
      )
      expect(packagingRecyclingNotesRepository.create).not.toHaveBeenCalled()
    })

    it('returns 409 when the accreditation has no credited balance yet', async () => {
      // A newly-approved accreditation that has submitted no summary logs has
      // no ledger, so its available balance is zero and any tonnage exceeds it.
      ledgerRepository = seedStream(null)

      const response = await createPrn({ ...validPayload, tonnage: 1 })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      expect(packagingRecyclingNotesRepository.create).not.toHaveBeenCalled()
    })

    it('reads the current ledger on each submission, rejecting after the balance drops', async () => {
      // Seeded balance is 500 available (beforeEach); 200 is comfortably within it.
      const first = await createPrn({ ...validPayload, tonnage: 200 })
      expect(first.statusCode).toBe(StatusCodes.CREATED)

      // A competing PRN ringfences 400 on the same ledger, dropping available
      // to 100 — the route must re-read this, not the balance it first saw.
      await ledgerRepository.appendEvents([
        buildPrnCreatedEvent({
          organisationId,
          registrationId,
          accreditationId,
          number: 2,
          payload: { prnId: 'competing-prn', amount: 400 },
          openingBalance: { amount: 500, availableAmount: 500 },
          closingBalance: { amount: 500, availableAmount: 100 }
        })
      ])

      const second = await createPrn({ ...validPayload, tonnage: 200 })
      expect(second.statusCode).toBe(StatusCodes.CONFLICT)
    })
  })

  describe('december waste validation', () => {
    const decemberBalance = {
      amount: 500,
      availableAmount: 500,
      decemberAmount: 300,
      decemberAvailableAmount: 300
    }

    it('returns 409 and creates no draft when the window is closed, even for an output reprocessor', async () => {
      vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'))

      const response = await createPrn({
        ...validPayload,
        isDecemberWaste: true
      })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      expect(JSON.parse(response.payload).code).toBe(
        DECEMBER_WASTE_NOT_DECLARABLE_CODE
      )
      expect(packagingRecyclingNotesRepository.create).not.toHaveBeenCalled()
    })

    it('creates the draft for an input reprocessor declaring December inside the window', async () => {
      vi.setSystemTime(new Date('2026-12-15T12:00:00.000Z'))
      useAccreditation({ reprocessingType: REPROCESSING_TYPE.INPUT })
      ledgerRepository = seedStream(decemberBalance)

      const response = await createPrn({
        ...validPayload,
        isDecemberWaste: true
      })

      expect(response.statusCode).toBe(StatusCodes.CREATED)
      expect(JSON.parse(response.payload).isDecemberWaste).toBe(true)
    })

    it('creates the draft for an exporter declaring December inside the window', async () => {
      vi.setSystemTime(new Date('2026-12-15T12:00:00.000Z'))
      useAccreditation(exporterAccreditation)
      ledgerRepository = seedStream(decemberBalance)

      const response = await createPrn({
        ...validPayload,
        isDecemberWaste: true
      })

      expect(response.statusCode).toBe(StatusCodes.CREATED)
      expect(JSON.parse(response.payload).isDecemberWaste).toBe(true)
    })

    it('creates the draft when isDecemberWaste is false outside the window, for any accreditation type', async () => {
      vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'))
      useAccreditation(exporterAccreditation)

      const response = await createPrn({
        ...validPayload,
        isDecemberWaste: false
      })

      expect(response.statusCode).toBe(StatusCodes.CREATED)
    })
  })

  describe('December pool routing at the create pre-check', () => {
    beforeEach(() => {
      useAccreditation(exporterAccreditation)
    })

    it('returns 409 when an exporter December raise exceeds the December pool, even when the total balance covers it', async () => {
      vi.setSystemTime(new Date('2026-12-15T12:00:00.000Z'))
      ledgerRepository = seedStream({
        amount: 500,
        availableAmount: 500,
        decemberAmount: 50,
        decemberAvailableAmount: 50
      })

      const response = await createPrn({
        ...validPayload,
        tonnage: 100,
        isDecemberWaste: true
      })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      expect(JSON.parse(response.payload).code).toBe(
        'INSUFFICIENT_AVAILABLE_BALANCE'
      )
      expect(packagingRecyclingNotesRepository.create).not.toHaveBeenCalled()
    })

    it('reserves the December pool from a general raise, refusing above total minus December', async () => {
      // available 500, December reserve 450 -> general cap 50
      ledgerRepository = seedStream({
        amount: 500,
        availableAmount: 500,
        decemberAmount: 450,
        decemberAvailableAmount: 450
      })

      const response = await createPrn({
        ...validPayload,
        tonnage: 100,
        isDecemberWaste: false
      })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      expect(JSON.parse(response.payload).code).toBe(
        'INSUFFICIENT_AVAILABLE_BALANCE'
      )
      expect(packagingRecyclingNotesRepository.create).not.toHaveBeenCalled()
    })

    it('permits a general raise up to the December-reserved cap', async () => {
      ledgerRepository = seedStream({
        amount: 500,
        availableAmount: 500,
        decemberAmount: 450,
        decemberAvailableAmount: 450
      })

      const response = await createPrn({
        ...validPayload,
        tonnage: 50,
        isDecemberWaste: false
      })

      expect(response.statusCode).toBe(StatusCodes.CREATED)
    })
  })

  describe('authentication', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await server.inject({
        method: 'POST',
        url,
        payload: validPayload
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })
  })

  describe('error handling', () => {
    it('re-throws Boom errors from repository', async () => {
      const Boom = await import('@hapi/boom')
      packagingRecyclingNotesRepository.create.mockRejectedValueOnce(
        Boom.default.notFound('Organisation not found')
      )

      const response = await createPrn()

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 500 for unexpected errors', async () => {
      packagingRecyclingNotesRepository.create.mockRejectedValueOnce(
        new Error('Database connection failed')
      )

      const response = await createPrn()

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    })
  })
})
