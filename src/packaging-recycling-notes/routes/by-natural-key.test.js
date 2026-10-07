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
  buildAwaitingAcceptancePrn,
  buildDeletedPrn,
  buildDraftPrn,
  underAccreditation
} from '#packaging-recycling-notes/repository/contract/test-data.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import {
  REPROCESSOR_NUMBER,
  accreditation,
  body,
  reprocessor
} from '#routes/organisations/organisation-view-test-helpers.js'

/** @import { PackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/port.js' */

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

const draft = {
  id: new ObjectId().toString(),
  ...buildDraftPrn({
    ...underAccreditation(ownIds),
    createdAt: new Date('2026-03-01T10:00:00Z'),
    notes: 'For the spring run'
  })
}
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

const prns = `/organisations/${organisation.orgId}/registrations/${REPROCESSOR_NUMBER}/accreditations/2026/packaging-recycling-notes`

describe('PRN routes by natural key', () => {
  setupAuthContext()

  /** @type {Awaited<ReturnType<typeof createTestServer>>} */
  let server
  /** @type {PackagingRecyclingNotesRepository} */
  let packagingRecyclingNotesRepository

  /** @param {{ cancellationEnabled?: boolean }} [options] */
  const startServer = async ({ cancellationEnabled = true } = {}) => {
    const prnRepositoryFactory =
      createInMemoryPackagingRecyclingNotesRepository([
        draft,
        issued,
        deleted,
        elsewhere
      ])
    packagingRecyclingNotesRepository = prnRepositoryFactory(createMockLogger())
    const ledgerRepository = createInMemoryLedgerRepository([
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

  afterEach(async () => {
    await server.stop()
  })

  describe('the collection', () => {
    beforeEach(() => startServer())

    it("serves the accreditation's PRNs that are not deleted, newest first", async () => {
      const response = await server.inject({ url: prns, ...asOperator() })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(idsOf(response)).toStrictEqual([issued.id, draft.id])
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
        tonnage: issued.tonnage,
        material: 'plastic',
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
        tonnage: draft.tonnage,
        material: 'plastic',
        processToBeUsed: 'R3',
        isDecemberWaste: false,
        obligationYear: draft.obligationYear,
        notes: 'For the spring run',
        createdAt: '2026-03-01T10:00:00.000Z',
        regulatorCancellable: false
      })
    })

    it('filters by status', async () => {
      const response = await server.inject({
        url: `${prns}?statuses=draft,cancelled`,
        ...asOperator()
      })

      expect(idsOf(response)).toStrictEqual([draft.id])
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
        status: PRN_STATUS.AWAITING_AUTHORISATION
      })
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
      expect(body(response)).toHaveProperty('mode')
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
        status: PRN_STATUS.CANCELLED
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
