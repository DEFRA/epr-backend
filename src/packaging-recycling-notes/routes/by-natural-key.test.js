import { ObjectId } from 'mongodb'
import { StatusCodes } from 'http-status-codes'

import { createTestServer } from '#test/create-test-server.js'
import {
  asOperator,
  asServiceMaintainer,
  asServiceMaintainerWrite
} from '#test/inject-auth.js'
import { createMockLogger } from '#test/mock-logger.js'
import { partialMock } from '#test/type-helpers.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  buildAccreditation,
  buildAwaitingAcceptancePrn,
  buildCancelledPrn,
  buildDeletedPrn,
  buildDraftPrn,
  underAccreditation
} from '#packaging-recycling-notes/repository/contract/test-data.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import {
  buildLedgerEvent,
  buildPrnCreatedEvent,
  buildPrnCreationCancelledEvent,
  buildPrnIssuedEvent
} from '#waste-balances/repository/ledger-test-data.js'
import {
  REPROCESSOR_NUMBER,
  accreditation,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import { body } from '#routes/organisations/organisation-view-test-helpers.js'

/**
 * @import { PackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/port.js'
 * @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js'
 */

vi.mock('@defra/cdp-auditing', () => ({ audit: vi.fn() }))

const accredited = accreditation()
const registration = reprocessor({ accreditationId: accredited.id })
const organisation = buildOrganisation({
  registrations: [registration],
  accreditations: [accredited]
})

const ownIds = {
  organisationId: organisation.id,
  registrationId: registration.id,
  accreditationId: accredited.id
}
const otherIds = {
  ...ownIds,
  accreditationId: new ObjectId().toString()
}

const fullSiteAddress = {
  line1: '1 Test Street',
  line2: 'Unit 4',
  town: 'Testville',
  county: 'Testshire',
  postcode: 'SW1A 1AA',
  country: 'England'
}

const draft = {
  id: new ObjectId().toString(),
  ...buildDraftPrn({
    ...underAccreditation(ownIds),
    createdAt: new Date('2026-03-01T10:00:00Z'),
    notes: 'For the spring run'
  })
}
draft.accreditation.siteAddress = fullSiteAddress
const issued = {
  id: new ObjectId().toString(),
  ...buildAwaitingAcceptancePrn({
    ...underAccreditation(ownIds),
    createdAt: new Date('2026-04-01T10:00:00Z'),
    issuedToOrganisation: {
      id: 'producer-1',
      name: 'Producer Ltd',
      tradingName: 'Producer',
      registrationType: 'COMPLIANCE_SCHEME'
    }
  })
}
const exported = {
  id: new ObjectId().toString(),
  ...buildCancelledPrn({
    ...underAccreditation(ownIds),
    organisation: {
      id: ownIds.organisationId,
      name: 'Test Organisation',
      tradingName: 'Test Trading'
    },
    accreditation: buildAccreditation({
      id: ownIds.accreditationId,
      material: 'glass',
      glassRecyclingProcess: 'glass_re_melt',
      siteAddress: undefined
    }),
    isExport: true,
    createdAt: new Date('2026-02-01T10:00:00Z')
  })
}
const deleted = {
  id: new ObjectId().toString(),
  ...buildDeletedPrn(underAccreditation(ownIds))
}
const elsewhere = {
  id: new ObjectId().toString(),
  ...buildAwaitingAcceptancePrn(underAccreditation(otherIds))
}

/** @param {{ payload: string }} response */
const idsOf = (response) =>
  body(response).items.map((/** @type {{ id: string }} */ { id }) => id)

const issuedBy = {
  organisationNumber: organisation.orgId,
  name: 'Test Organisation'
}

const prns = `/organisations/${organisation.orgId}/registrations/${REPROCESSOR_NUMBER}/accreditations/2026/packaging-recycling-notes`

describe('PRN routes by natural key', () => {
  setupAuthContext()

  /** @type {Awaited<ReturnType<typeof createTestServer>>} */
  let server
  /** @type {PackagingRecyclingNotesRepository} */
  let packagingRecyclingNotesRepository
  /** @type {WasteBalanceLedgerRepository} */
  let ledgerRepository

  /** @param {{ cancellationEnabled?: boolean }} [options] */
  const startServer = async ({ cancellationEnabled = true } = {}) => {
    const prnRepositoryFactory =
      createInMemoryPackagingRecyclingNotesRepository([
        draft,
        issued,
        exported,
        deleted,
        elsewhere
      ])
    packagingRecyclingNotesRepository = prnRepositoryFactory(createMockLogger())
    ledgerRepository = createInMemoryLedgerRepository([
      partialMock(
        buildLedgerEvent({
          ...ownIds,
          number: 1,
          payload: { summaryLogId: 'log-1', creditTotal: 500 },
          openingBalance: { amount: 0, availableAmount: 0 },
          closingBalance: { amount: 500, availableAmount: 500 }
        })
      )
    ])()

    server = await createTestServer({
      repositories: {
        organisationsRepository: createInMemoryOrganisationsRepository([
          partialMock(organisation)
        ]),
        packagingRecyclingNotesRepository: prnRepositoryFactory,
        ledgerRepository: () => ledgerRepository,
        reportsRepository: createInMemoryReportsRepository()
      },
      config: { featureFlags: { prnAdminCancellation: cancellationEnabled } }
    })
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'))
  })

  afterEach(async () => {
    vi.useRealTimers()
    await server.stop()
  })

  describe('the collection', () => {
    beforeEach(() => startServer())

    it("serves the accreditation's PRNs that are not deleted, newest first", async () => {
      const response = await server.inject({ url: prns, ...asOperator() })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(idsOf(response)).toStrictEqual([issued.id, draft.id, exported.id])
    })

    it('serves an issued PRN with its number and issue', async () => {
      const response = await server.inject({ url: prns, ...asOperator() })

      expect(body(response).items[0]).toStrictEqual({
        id: issued.id,
        prnNumber: issued.prnNumber,
        status: PRN_STATUS.AWAITING_ACCEPTANCE,
        issuedToOrganisation: {
          id: 'producer-1',
          name: 'Producer Ltd',
          tradingName: 'Producer',
          registrationType: 'COMPLIANCE_SCHEME'
        },
        issuedByOrganisation: issuedBy,
        registration: { registrationNumber: REPROCESSOR_NUMBER },
        accreditation: {
          accreditationNumber: issued.accreditation.accreditationNumber,
          accreditationYear: 2026,
          wasteProcessingType: 'reprocessor',
          material: 'plastic',
          submittedToRegulator: { code: 'ea' },
          siteAddress: { line1: '1 Test Street', postcode: 'SW1A 1AA' }
        },
        tonnage: issued.tonnage,
        processToBeUsed: 'R3',
        isDecemberWaste: false,
        obligationYear: issued.obligationYear,
        createdAt: '2026-04-01T10:00:00.000Z',
        issued: {
          at: issued.status.issued?.at.toISOString(),
          by: { name: 'Issuer User', position: 'Manager' }
        },
        regulatorCancellable: true
      })
    })

    it('serves a draft PRN with no number and no issue', async () => {
      const response = await server.inject({ url: prns, ...asOperator() })

      expect(body(response).items[1]).toStrictEqual({
        id: draft.id,
        status: PRN_STATUS.DRAFT,
        issuedToOrganisation: {
          id: draft.issuedToOrganisation.id,
          name: draft.issuedToOrganisation.name,
          tradingName: draft.issuedToOrganisation.tradingName
        },
        issuedByOrganisation: issuedBy,
        registration: { registrationNumber: REPROCESSOR_NUMBER },
        accreditation: {
          accreditationNumber: draft.accreditation.accreditationNumber,
          accreditationYear: 2026,
          wasteProcessingType: 'reprocessor',
          material: 'plastic',
          submittedToRegulator: { code: 'ea' },
          siteAddress: fullSiteAddress
        },
        tonnage: draft.tonnage,
        processToBeUsed: 'R3',
        isDecemberWaste: false,
        obligationYear: draft.obligationYear,
        notes: 'For the spring run',
        createdAt: '2026-03-01T10:00:00.000Z',
        regulatorCancellable: false
      })
    })

    it("serves an exporter's PRN with its trading name and glass process", async () => {
      const response = await server.inject({ url: prns, ...asOperator() })

      expect(body(response).items[2]).toMatchObject({
        issuedByOrganisation: {
          organisationNumber: organisation.orgId,
          name: 'Test Organisation',
          tradingName: 'Test Trading'
        },
        accreditation: {
          wasteProcessingType: 'exporter',
          material: 'glass',
          glassRecyclingProcess: 'glass_re_melt'
        }
      })
      expect(body(response).items[2].accreditation).not.toHaveProperty(
        'siteAddress'
      )
    })

    describe('when the ledger is ahead of a stored PRN', () => {
      const AFTER_CREATION = { amount: 500, availableAmount: 400 }

      /** @param {object} overrides */
      const draftEvent = (overrides) => ({
        ...ownIds,
        payload: { prnId: draft.id, amount: 100 },
        ...overrides
      })

      beforeEach(async () => {
        await ledgerRepository.appendEvents([
          buildPrnCreatedEvent(
            draftEvent({
              number: 2,
              openingBalance: { amount: 500, availableAmount: 500 },
              closingBalance: AFTER_CREATION
            })
          )
        ])
      })

      it('serves the PRN as the ledger has it', async () => {
        await ledgerRepository.appendEvents([
          buildPrnIssuedEvent(
            draftEvent({
              number: 3,
              openingBalance: AFTER_CREATION,
              closingBalance: { amount: 400, availableAmount: 400 }
            })
          )
        ])

        const response = await server.inject({
          url: `${prns}?statuses=awaiting_acceptance`,
          ...asOperator()
        })

        expect(idsOf(response)).toStrictEqual([issued.id, draft.id])
      })

      it('leaves out a PRN the ledger has deleted', async () => {
        await ledgerRepository.appendEvents([
          buildPrnCreationCancelledEvent(
            draftEvent({
              number: 3,
              openingBalance: AFTER_CREATION,
              closingBalance: { amount: 500, availableAmount: 500 }
            })
          )
        ])

        const response = await server.inject({ url: prns, ...asOperator() })

        expect(idsOf(response)).toStrictEqual([issued.id, exported.id])
      })
    })

    it('filters by status', async () => {
      const response = await server.inject({
        url: `${prns}?statuses=draft,cancelled`,
        ...asOperator()
      })

      expect(idsOf(response)).toStrictEqual([draft.id, exported.id])
    })

    it('refuses to filter by a status it never serves', async () => {
      const response = await server.inject({
        url: `${prns}?statuses=deleted`,
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('finds a PRN by its number', async () => {
      const response = await server.inject({
        url: `${prns}?prnNumber=${issued.prnNumber}`,
        ...asOperator()
      })

      expect(idsOf(response)).toStrictEqual([issued.id])
    })

    it('serves an admin', async () => {
      const response = await server.inject({
        url: prns,
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('is not found for a year the registration has no accreditation', async () => {
      const response = await server.inject({
        url: prns.replace('/2026/', '/2025/'),
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('one PRN', () => {
    beforeEach(() => startServer())

    it('serves a PRN of the accreditation', async () => {
      const response = await server.inject({
        url: `${prns}/${draft.id}`,
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(body(response)).toMatchObject({
        id: draft.id,
        status: PRN_STATUS.DRAFT
      })
    })

    it.each([
      ['of another accreditation', elsewhere.id],
      ['that was deleted', deleted.id],
      ['that does not exist', new ObjectId().toString()]
    ])('is not found for a PRN %s', async (_, prnId) => {
      const response = await server.inject({
        url: `${prns}/${prnId}`,
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('commands', () => {
    beforeEach(() => startServer())

    it('creates a PRN under the accreditation', async () => {
      const response = await server.inject({
        method: 'POST',
        url: prns,
        payload: {
          issuedToOrganisation: { id: 'producer-2', name: 'Producer Two' },
          tonnage: 10
        },
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.CREATED)
      const created = await packagingRecyclingNotesRepository.findById(
        body(response).id
      )
      expect(created).toMatchObject({
        organisation: { id: organisation.id },
        registrationId: registration.id,
        accreditation: { id: accredited.id }
      })
    })

    it('serves the created PRN', async () => {
      const response = await server.inject({
        method: 'POST',
        url: prns,
        payload: {
          issuedToOrganisation: { id: 'producer-2', name: 'Producer Two' },
          tonnage: 10
        },
        ...asOperator()
      })

      expect(body(response)).toStrictEqual({
        id: expect.any(String),
        status: PRN_STATUS.DRAFT,
        issuedToOrganisation: { id: 'producer-2', name: 'Producer Two' },
        issuedByOrganisation: expect.objectContaining({
          organisationNumber: organisation.orgId
        }),
        registration: { registrationNumber: REPROCESSOR_NUMBER },
        accreditation: expect.objectContaining({
          accreditationNumber: accredited.accreditationNumber,
          wasteProcessingType: 'reprocessor',
          material: accredited.material
        }),
        tonnage: 10,
        processToBeUsed: expect.any(String),
        isDecemberWaste: false,
        obligationYear: 2026,
        createdAt: '2026-06-01T00:00:00.000Z',
        regulatorCancellable: false
      })
    })

    it("changes a PRN's status", async () => {
      const response = await server.inject({
        method: 'POST',
        url: `${prns}/${draft.id}/status`,
        payload: { status: PRN_STATUS.AWAITING_AUTHORISATION },
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(body(response)).toMatchObject({
        id: draft.id,
        status: PRN_STATUS.AWAITING_AUTHORISATION,
        notes: 'For the spring run'
      })
      expect(body(response)).not.toHaveProperty('prnNumber')
    })

    it("refuses a status change to another accreditation's PRN", async () => {
      const response = await server.inject({
        method: 'POST',
        url: `${prns}/${elsewhere.id}/status`,
        payload: { status: PRN_STATUS.ACCEPTED },
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('serves December eligibility', async () => {
      const response = await server.inject({
        url: `${prns}/december-prn-eligibility`,
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(body(response)).toStrictEqual({
        mode: expect.any(String),
        windowOpen: false
      })
    })
  })

  describe('cancelling', () => {
    it('cancels a PRN of the accreditation', async () => {
      await startServer()

      const response = await server.inject({
        method: 'POST',
        url: `${prns}/${issued.id}/cancel`,
        ...asServiceMaintainerWrite()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(body(response)).toMatchObject({
        id: issued.id,
        prnNumber: issued.prnNumber,
        status: PRN_STATUS.CANCELLED,
        regulatorCancellable: false
      })
    })

    it("is not found for another accreditation's PRN", async () => {
      await startServer()

      const response = await server.inject({
        method: 'POST',
        url: `${prns}/${elsewhere.id}/cancel`,
        ...asServiceMaintainerWrite()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      expect(
        (await packagingRecyclingNotesRepository.findById(elsewhere.id))?.status
          .currentStatus
      ).toBe(PRN_STATUS.AWAITING_ACCEPTANCE)
    })

    it('is not served while admin cancellation is switched off', async () => {
      await startServer({ cancellationEnabled: false })

      const response = await server.inject({
        method: 'POST',
        url: `${prns}/${issued.id}/cancel`,
        ...asServiceMaintainerWrite()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})
