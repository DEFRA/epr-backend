import Boom from '@hapi/boom'
import { createInMemoryOrganisationReadRepository } from '#organisation-read-model/repository/inmemory.js'
import {
  approvedStatusFrom,
  approvedTimelineFrom,
  buildReadAccreditation,
  buildReadExporterAccreditation,
  buildReadExporterRegistration,
  buildReadOrganisation,
  buildReadReprocessorRegistration
} from '#organisation-read-model/repository/read-model-test-data.js'
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
import { PRN_YEAR } from '#packaging-recycling-notes/repository/contract/test-data.js'
import { toYear } from '#common/helpers/dates/year.js'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { createMockLogger } from '#test/mock-logger.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import {
  ACCREDITATION_NUMBER,
  EXPORTER_NUMBER,
  REPROCESSOR_NUMBER
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import {
  toAccreditationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'

const { buildOrganisation } = createOrganisationBuilders()

/** @import { MockInstance } from 'vitest' */
/** @import { PackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/port.js' */
/** @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */

const { organisationNumber } = buildOrganisation()

/**
 * The served accreditation's ledger for the year it is accredited, under the
 * reprocessor or exporter registration a test serves it under.
 *
 * @param {string} registrationNumber
 * @param {Year} [year]
 */
const ledgerUnder = (registrationNumber, year = PRN_YEAR) => ({
  organisationNumber,
  registrationNumber: toRegistrationNumber(registrationNumber),
  accreditationNumber: toAccreditationNumber(ACCREDITATION_NUMBER),
  year
})

const SEED_BALANCE = { amount: 500, availableAmount: 500 }

/**
 * An in-memory stream seeded with one summary-log submission, opening the
 * ledger at the given balance so the create route's pre-check resolves
 * against it. Passing `null` leaves the ledger absent, which resolves to zero
 * available.
 *
 * @param {{ amount: number, availableAmount: number, decemberAmount?: number, decemberAvailableAmount?: number } | null} [closingBalance]
 * @param {Year} [year] - the year of the accreditation whose ledger is opened
 */
const seedStream = (closingBalance = SEED_BALANCE, year = PRN_YEAR) =>
  createInMemoryLedgerRepository(
    closingBalance
      ? [REPROCESSOR_NUMBER, EXPORTER_NUMBER].map((number) =>
          partialMock(
            buildLedgerEvent({
              ...ledgerUnder(number, year),
              number: 1,
              payload: {
                summaryLogId: 'log-1',
                creditTotal: closingBalance.amount
              },
              openingBalance: { amount: 0, availableAmount: 0 },
              closingBalance
            })
          )
        )
      : []
  )()

/** @type {import('#organisation-read-model/domain/model.js').StatusTimeline<import('#organisation-read-model/domain/model.js').AccreditationStatus>} */
const cancelledTimeline = [
  { status: 'approved', at: '2026-01-01T00:00:00.000Z' },
  { status: 'cancelled', at: '2026-03-01T00:00:00.000Z' }
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

  /** @type {Awaited<ReturnType<typeof createTestServer>>} */
  let server
  /** @type {PackagingRecyclingNotesRepository} */
  let packagingRecyclingNotesRepository
  /** @type {MockInstance<PackagingRecyclingNotesRepository['create']>} */
  let createSpy
  /** @type {WasteBalanceLedgerRepository} */
  let ledgerRepository
  /** @type {string} */
  let url
  /** @type {string} */
  let registrationNumber

  /**
   * Starts a server serving the organisation with one accreditation, an output
   * reprocessor's for plastic in 2026 unless overridden, at the URL its
   * natural keys name.
   *
   * @param {{
   *   exporting?: boolean,
   *   year?: number,
   *   material?: string,
   *   reprocessingType?: 'input' | 'output',
   *   status?: import('#organisation-read-model/domain/model.js').Status<import('#organisation-read-model/domain/model.js').AccreditationStatus>,
   *   tradingName?: string
   * }} [options]
   */
  const useAccreditation = async ({
    exporting = false,
    year = 2026,
    material = MATERIAL.PLASTIC,
    reprocessingType = REPROCESSING_TYPE.OUTPUT,
    status,
    tradingName
  } = {}) => {
    const validFrom = `${year}-01-01`
    const served = buildReadAccreditation({
      accreditationNumber: toAccreditationNumber(ACCREDITATION_NUMBER),
      status: status ?? approvedStatusFrom(validFrom)
    })
    /** @type {Partial<import('#organisation-read-model/domain/model.js').RegistrationCommon>} */
    const registrationFields = {
      material: /** @type {any} */ (material),
      status: approvedStatusFrom(validFrom),
      standingByDate: { [year]: { [validFrom]: { standing: 'accredited' } } }
    }
    const registration = {
      registrationNumber: exporting ? EXPORTER_NUMBER : REPROCESSOR_NUMBER
    }
    const organisation = buildReadOrganisation({
      organisationNumber,
      ...(tradingName && { tradingName }),
      registrations: {
        [registration.registrationNumber]: exporting
          ? buildReadExporterRegistration({
              ...registrationFields,
              accreditations: {
                [year]: buildReadExporterAccreditation(served)
              }
            })
          : buildReadReprocessorRegistration({
              ...registrationFields,
              reprocessingType,
              accreditations: { [year]: served }
            })
      }
    })
    await server?.stop()
    server = await createTestServer({
      repositories: {
        packagingRecyclingNotesRepository: () =>
          packagingRecyclingNotesRepository,
        organisationReadRepository: createInMemoryOrganisationReadRepository([
          organisation
        ]),
        ledgerRepository: () => ledgerRepository
      }
    })
    await server.initialize()

    registrationNumber = registration.registrationNumber
    url = `/organisations/${organisationNumber}/registrations/${registrationNumber}/accreditations/${year}/packaging-recycling-notes`
  }

  /** The PRN data the route first passed to the repository's create. */
  const firstCreatedPrn = () => {
    const call = createSpy.mock.calls[0]
    if (!call) {
      throw new Error('Expected the repository to have created a PRN')
    }
    return call[0]
  }

  beforeAll(async () => {
    packagingRecyclingNotesRepository =
      createInMemoryPackagingRecyclingNotesRepository()(createMockLogger())
    createSpy = vi.spyOn(packagingRecyclingNotesRepository, 'create')
  })

  beforeEach(async () => {
    vi.setSystemTime(new Date('2026-10-01T12:00:00.000Z'))
    ledgerRepository = seedStream()
    await useAccreditation()
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
          organisation: expect.objectContaining({
            organisationNumber
          }),
          registration: { registrationNumber },
          accreditation: expect.objectContaining({
            accreditationNumber: ACCREDITATION_NUMBER
          }),
          obligationYear: 2026,
          issuedToOrganisation: validPayload.issuedToOrganisation
        })
      )
    })

    it('stores the organisation, registration and accreditation by number, with no database ids', async () => {
      const response = await createPrn()

      const stored = await packagingRecyclingNotesRepository.findById(
        JSON.parse(response.payload).id
      )
      expect(stored?.organisation).toMatchObject({
        organisationNumber
      })
      expect(stored?.organisation).not.toHaveProperty('id')
      expect(stored).toMatchObject({ registration: { registrationNumber } })
      expect(stored).not.toHaveProperty('registrationId')
      expect(stored?.accreditation).not.toHaveProperty('id')
    })

    it("stores the organisation's trading name when it has one", async () => {
      await useAccreditation({ tradingName: 'ACME Trading' })

      const response = await createPrn()

      const stored = await packagingRecyclingNotesRepository.findById(
        JSON.parse(response.payload).id
      )
      expect(stored?.organisation).toMatchObject({
        organisationNumber,
        tradingName: 'ACME Trading'
      })
    })

    it('sets obligationYear from the accreditation year', async () => {
      vi.setSystemTime(new Date('2027-03-01T12:00:00.000Z'))
      ledgerRepository = seedStream(SEED_BALANCE, toYear(2027))
      await useAccreditation({ year: 2027 })

      await createPrn()

      expect(packagingRecyclingNotesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ obligationYear: 2027 })
      )
    })

    it('creates PRN with draft status and history but no created operation', async () => {
      await createPrn()

      const createArg = firstCreatedPrn()
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
      await useAccreditation({ exporting: true })

      await createPrn()

      expect(packagingRecyclingNotesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ isExport: true })
      )
    })

    it('snapshots glass recycling process for glass accreditations', async () => {
      await useAccreditation({ material: 'glass_re_melt' })

      await createPrn()

      expect(packagingRecyclingNotesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          accreditation: expect.objectContaining({
            material: MATERIAL.GLASS,
            glassRecyclingProcess: 'glass_re_melt'
          })
        })
      )
    })

    it("snapshots the registration's site address", async () => {
      await createPrn()

      expect(firstCreatedPrn().accreditation.siteAddress).toStrictEqual({
        line1: '7 Glass processing site',
        town: 'London',
        postcode: 'SW2A 0AA'
      })
    })

    it('omits glass recycling process for non-glass accreditations', async () => {
      await createPrn()

      const createArg = firstCreatedPrn()
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

      const createArg = firstCreatedPrn()
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

      const createArg = firstCreatedPrn()
      expect(createArg.issuedToOrganisation).not.toHaveProperty('tradingName')
    })

    it('omits notes key from stored data when no notes provided', async () => {
      await createPrn()

      const createArg = firstCreatedPrn()
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
      await useAccreditation({
        status: {
          current: 'cancelled',
          lastUpdatedAt: '2026-03-01T00:00:00.000Z',
          timeline: cancelledTimeline
        }
      })

      const response = await createPrn()

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
      expect(JSON.parse(response.payload).message).toBe(
        'Cannot create a PRN on a cancelled accreditation'
      )
      expect(packagingRecyclingNotesRepository.create).not.toHaveBeenCalled()
    })

    it('creates a PRN once the accreditation is approved again', async () => {
      await useAccreditation({
        status: {
          current: 'approved',
          lastUpdatedAt: '2026-04-01T00:00:00.000Z',
          timeline: [
            ...cancelledTimeline,
            { status: 'approved', at: '2026-04-01T00:00:00.000Z' }
          ]
        }
      })

      const response = await createPrn()

      expect(response.statusCode).toBe(StatusCodes.CREATED)
    })

    it('creates a PRN when the accreditation is suspended', async () => {
      await useAccreditation({
        status: {
          current: 'suspended',
          lastUpdatedAt: '2026-01-01T00:00:00.000Z',
          timeline: approvedTimelineFrom('2026-01-01')
        }
      })

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
      await useAccreditation({ exporting: true })
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
          ...ledgerUnder(REPROCESSOR_NUMBER),
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
      await useAccreditation({ reprocessingType: REPROCESSING_TYPE.INPUT })
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
      await useAccreditation({ exporting: true })
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
      await useAccreditation({ exporting: true })

      const response = await createPrn({
        ...validPayload,
        isDecemberWaste: false
      })

      expect(response.statusCode).toBe(StatusCodes.CREATED)
    })
  })

  describe('December pool routing at the create pre-check', () => {
    beforeEach(async () => {
      await useAccreditation({ exporting: true })
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
      createSpy.mockRejectedValueOnce(Boom.notFound('Organisation not found'))

      const response = await createPrn()

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 500 for unexpected errors', async () => {
      createSpy.mockRejectedValueOnce(new Error('Database connection failed'))

      const response = await createPrn()

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    })
  })
})
