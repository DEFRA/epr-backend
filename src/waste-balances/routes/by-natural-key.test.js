import { StatusCodes } from 'http-status-codes'

import { createTestServer } from '#test/create-test-server.js'
import { asOperator, asServiceMaintainer } from '#test/inject-auth.js'
import { partialMock } from '#test/type-helpers.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  buildLedgerEvent,
  buildPrnCreatedEvent
} from '#waste-balances/repository/ledger-test-data.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createMockIssuedPrn } from '#packaging-recycling-notes/routes/test-helpers.js'
import {
  EXPORTER_NUMBER,
  REPROCESSOR_NUMBER,
  accreditation,
  exporter,
  exporterAccreditation,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'

const REGISTERED_ONLY_NUMBER = 'R26ER5001180099PL'

const registeredOnly = reprocessor({
  registrationNumber: REGISTERED_ONLY_NUMBER,
  statusHistory: [
    { status: 'created', updatedAt: '2024-01-01T09:00:00.000Z' },
    { status: 'approved', updatedAt: '2024-02-01T09:00:00.000Z' }
  ]
})
const accredited = accreditation()
const accreditedRegistration = reprocessor({ accreditationId: accredited.id })
const accreditedExport = exporterAccreditation()
const accreditedExporter = exporter({ accreditationId: accreditedExport.id })
const unnumberedAccreditation = accreditation({
  accreditationNumber: 'A26ER5001180116PL'
})
const unnumbered = reprocessor({
  registrationNumber: undefined,
  accreditationId: unnumberedAccreditation.id
})
const organisation = buildOrganisation({
  registrations: [
    registeredOnly,
    accreditedRegistration,
    accreditedExporter,
    unnumbered
  ],
  accreditations: [accredited, accreditedExport, unnumberedAccreditation]
})

const sharedNumberAccreditations = [accreditation(), accreditation()]
const sharedNumberExportAccreditation = exporterAccreditation()
const sharedNumberOrganisation = buildOrganisation({
  registrations: [
    ...sharedNumberAccreditations.map(({ id }) =>
      reprocessor({ accreditationId: id })
    ),
    exporter({ accreditationId: sharedNumberExportAccreditation.id })
  ],
  accreditations: [
    ...sharedNumberAccreditations,
    sharedNumberExportAccreditation
  ]
})

const registrations = `/organisations/${organisation.orgId}/registrations`
const registeredOnlyLedger = (year) =>
  `${registrations}/${REGISTERED_ONLY_NUMBER}/ledger/${year}`
const accreditationPath = (year) =>
  `${registrations}/${REPROCESSOR_NUMBER}/accreditations/${year}`

const accreditedLedgerId = {
  organisationId: organisation.id,
  registrationId: accreditedRegistration.id,
  accreditationId: accredited.id
}

const issuedNote = createMockIssuedPrn({
  id: 'prn-numbered',
  prnNumber: 'ER26000123',
  organisation: { id: organisation.id, name: 'A reprocessor' },
  registrationId: accreditedRegistration.id,
  accreditation: { ...createMockIssuedPrn().accreditation, id: accredited.id }
})

/** @param {{ payload: string }} response */
const body = (response) => JSON.parse(response.payload)

/** @param {object} overrides */
const registeredOnlyEvent = (overrides) =>
  buildLedgerEvent({
    organisationId: organisation.id,
    registrationId: registeredOnly.id,
    accreditationId: null,
    ...overrides
  })

describe('ledger and waste balance routes by natural key', () => {
  setupAuthContext()

  /** @type {Awaited<ReturnType<typeof createTestServer>>} */
  let server

  beforeEach(async () => {
    server = await createTestServer({
      repositories: {
        organisationsRepository: createInMemoryOrganisationsRepository([
          partialMock(organisation),
          partialMock(sharedNumberOrganisation)
        ]),
        packagingRecyclingNotesRepository:
          createInMemoryPackagingRecyclingNotesRepository([issuedNote], [])
      }
    })
  })

  /** @param {string} url */
  const get = (url, auth = asServiceMaintainer()) =>
    server.inject({ method: 'GET', url, ...auth })

  describe('GET R/ledger/{year}', () => {
    beforeEach(async () => {
      await server.app.ledgerRepository.appendEvents([
        registeredOnlyEvent({
          number: 1,
          createdAt: new Date('2025-12-31T23:59:59.999Z')
        })
      ])
      await server.app.ledgerRepository.appendEvents([
        registeredOnlyEvent({
          number: 2,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          payload: { summaryLogId: 'file-2026', creditTotal: 5 }
        })
      ])
    })

    it('serves the registered-only events submitted in the year, and no ids', async () => {
      const response = await get(registeredOnlyLedger(2025))

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(body(response)).toEqual({
        events: [
          {
            number: 1,
            kind: 'summary-log-submitted',
            createdAt: '2025-12-31T23:59:59.999Z',
            createdBy: { id: 'user-1', name: 'Test User' },
            balance: {
              opening: { total: 0, available: 0 },
              closing: { total: 100, available: 100 }
            },
            summaryLog: { id: 'log-1', creditTotal: 100 }
          }
        ]
      })
    })

    it('serves the next year its own events', async () => {
      const response = await get(registeredOnlyLedger(2026))

      expect(body(response).events.map((event) => event.number)).toEqual([2])
    })

    it('serves no events for an approved year with none', async () => {
      const response = await get(registeredOnlyLedger(2024))

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(body(response)).toEqual({ events: [] })
    })

    it('returns 404 for a year the registration was not approved in', async () => {
      const response = await get(registeredOnlyLedger(2099))

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 404 for an unknown registration number', async () => {
      const response = await get(
        `${registrations}/R26ER0000000000PL/ledger/2026`
      )

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 404 for an unknown organisation number', async () => {
      const response = await get(
        `/organisations/999999/registrations/${REGISTERED_ONLY_NUMBER}/ledger/2026`
      )

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it.each(['abc', '2023', '2101'])(
      'returns 422 for the year %s',
      async (year) => {
        const response = await get(registeredOnlyLedger(year))

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      }
    )

    it('returns 403 to a caller who may not read ledgers', async () => {
      const response = await get(registeredOnlyLedger(2026), asOperator())

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })

  describe('GET R/accreditations/{year}/ledger', () => {
    it('serves the accreditation’s whole ledger, and no ids', async () => {
      await server.app.ledgerRepository.appendEvents([
        buildLedgerEvent({ ...accreditedLedgerId, number: 1 })
      ])
      await server.app.ledgerRepository.appendEvents([
        buildPrnCreatedEvent({
          ...accreditedLedgerId,
          number: 2,
          createdAt: new Date('2027-01-10T10:00:00.000Z'),
          payload: { prnId: 'prn-numbered', amount: 50 }
        })
      ])

      const response = await get(`${accreditationPath(2026)}/ledger`)

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(body(response)).toEqual({
        events: [
          {
            number: 1,
            kind: 'summary-log-submitted',
            createdAt: '2026-01-15T10:00:00.000Z',
            createdBy: { id: 'user-1', name: 'Test User' },
            balance: {
              opening: { total: 0, available: 0 },
              closing: { total: 100, available: 100 }
            },
            summaryLog: { id: 'log-1', creditTotal: 100 }
          },
          {
            number: 2,
            kind: 'prn-created',
            createdAt: '2027-01-10T10:00:00.000Z',
            createdBy: { id: 'user-1', name: 'Test User' },
            balance: {
              opening: { total: 100, available: 100 },
              closing: { total: 100, available: 50 }
            },
            prn: { id: 'prn-numbered', prnNumber: 'ER26000123', tonnage: 50 }
          }
        ]
      })
    })

    it('returns 404 for a year the registration holds no accreditation', async () => {
      const response = await get(`${accreditationPath(2027)}/ledger`)

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 404 for a registered-only registration', async () => {
      const response = await get(
        `${registrations}/${REGISTERED_ONLY_NUMBER}/accreditations/2026/ledger`
      )

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 422 for a year out of range', async () => {
      const response = await get(`${accreditationPath(2101)}/ledger`)

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })

  describe('GET /organisations/{organisationNumber}/waste-balances?year=', () => {
    const wasteBalances = (query) =>
      `/organisations/${organisation.orgId}/waste-balances${query}`

    it('serves a balance for each accreditation in the year, named by registration number, leaving out a registration with no number', async () => {
      await server.app.ledgerRepository.appendEvents([
        buildLedgerEvent(accreditedLedgerId)
      ])
      await server.app.ledgerRepository.appendEvents([
        buildLedgerEvent({
          organisationId: organisation.id,
          registrationId: accreditedExporter.id,
          accreditationId: accreditedExport.id,
          closingBalance: {
            amount: 120,
            availableAmount: 100,
            decemberAmount: 10,
            decemberAvailableAmount: 10
          }
        })
      ])

      const response = await get(wasteBalances('?year=2026'))

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(body(response)).toEqual([
        {
          registrationNumber: REPROCESSOR_NUMBER,
          year: 2026,
          amount: 100,
          availableAmount: 100
        },
        {
          registrationNumber: EXPORTER_NUMBER,
          year: 2026,
          amount: 120,
          availableAmount: 100,
          decemberAmount: 10,
          decemberAvailableAmount: 10,
          nonDecemberAvailableAmount: 90
        }
      ])
    })

    it('serves zeros for an accreditation with no ledger', async () => {
      const response = await get(wasteBalances('?year=2026'))

      expect(body(response)).toEqual([
        {
          registrationNumber: REPROCESSOR_NUMBER,
          year: 2026,
          amount: 0,
          availableAmount: 0
        },
        {
          registrationNumber: EXPORTER_NUMBER,
          year: 2026,
          amount: 0,
          availableAmount: 0
        }
      ])
    })

    it('leaves out registrations that share a number', async () => {
      const response = await get(
        `/organisations/${sharedNumberOrganisation.orgId}/waste-balances?year=2026`
      )

      expect(body(response)).toEqual([
        {
          registrationNumber: EXPORTER_NUMBER,
          year: 2026,
          amount: 0,
          availableAmount: 0
        }
      ])
    })

    it('serves none for a year with no accreditations', async () => {
      const response = await get(wasteBalances('?year=2027'))

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(body(response)).toEqual([])
    })

    it.each(['', '?year=abc', '?year=2101'])(
      'returns 422 for the query "%s"',
      async (query) => {
        const response = await get(wasteBalances(query))

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      }
    )

    it('returns 404 for an unknown organisation number', async () => {
      const response = await get(
        '/organisations/999999/waste-balances?year=2026'
      )

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})
