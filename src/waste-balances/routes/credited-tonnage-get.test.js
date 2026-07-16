import { ObjectId } from 'mongodb'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asOperator, asServiceMaintainerRead } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createInMemorySummaryLogRowStateRepository } from '#waste-records/repository/inmemory.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { buildSummaryLogRowStateEntry } from '#waste-records/repository/test-data.js'
import {
  buildRegistration,
  buildOrganisationWithRegistration
} from '#repositories/organisations/contract/test-data.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { creditedTonnageGetPath } from './credited-tonnage-get.js'

const SUMMARY_LOG_ID = 'sl-credited-1'

const injectReport = (server, credentials) =>
  server.inject({
    method: 'GET',
    url: creditedTonnageGetPath,
    ...credentials
  })

describe(`GET ${creditedTonnageGetPath}`, () => {
  setupAuthContext()

  describe('access control', () => {
    let server

    beforeAll(async () => {
      server = await createTestServer({})
    })

    afterAll(async () => {
      await server.stop()
    })

    it('returns 401 when unauthenticated', async () => {
      const response = await server.inject({
        method: 'GET',
        url: creditedTonnageGetPath
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 for a user without the adminRead scope', async () => {
      const response = await injectReport(server, asOperator())

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('returns 200 for a user with the adminRead scope', async () => {
      const response = await injectReport(server, asServiceMaintainerRead())

      expect(response.statusCode).toBe(StatusCodes.OK)
    })
  })

  it('returns a valid empty report when no accreditation has a submission', async () => {
    const server = await createTestServer({})

    const response = await injectReport(server, asServiceMaintainerRead())

    expect(response.statusCode).toBe(StatusCodes.OK)
    const body = JSON.parse(response.payload)
    expect(body.data).toEqual([])
    expect(typeof body.meta.generatedAt).toBe('string')

    await server.stop()
  })

  it('returns a credited-tonnage row derived from an accreditation latest submission', async () => {
    const accreditationId = new ObjectId().toString()
    const registration = buildRegistration({
      accreditationId,
      wasteProcessingType: 'reprocessor',
      reprocessingType: 'input',
      material: 'plastic'
    })
    const org = buildOrganisationWithRegistration(registration, 'approved')
    org.orgId = 500123

    const linkedRegistration = org.registrations[0]
    const linkedAccreditation = org.accreditations[0]
    const ledgerId = {
      organisationId: org.id,
      registrationId: linkedRegistration.id,
      accreditationId: linkedAccreditation.id
    }

    const summaryLogRowStatesRepository =
      createInMemorySummaryLogRowStateRepository()()
    await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
      ledgerId,
      [
        buildSummaryLogRowStateEntry({
          rowId: 'row-1',
          wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
          processingType: 'REPROCESSOR_INPUT',
          data: {
            DATE_RECEIVED_FOR_REPROCESSING: '2026-02-10',
            TONNAGE_RECEIVED_FOR_RECYCLING: 100
          },
          classification: {
            outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
            reasons: [],
            transactionAmount: 100
          }
        })
      ],
      SUMMARY_LOG_ID
    )

    const ledgerRepository = createInMemoryLedgerRepository([
      buildLedgerEvent({
        organisationId: org.id,
        registrationId: linkedRegistration.id,
        accreditationId: linkedAccreditation.id,
        number: 1,
        payload: { summaryLogId: SUMMARY_LOG_ID, creditTotal: 100 }
      })
    ])()

    const server = await createTestServer({
      repositories: {
        organisationsRepository: createInMemoryOrganisationsRepository([org]),
        ledgerRepository,
        summaryLogRowStatesRepository
      }
    })

    const response = await injectReport(server, asServiceMaintainerRead())

    expect(response.statusCode).toBe(StatusCodes.OK)
    const body = JSON.parse(response.payload)

    const februaryRow = body.data.find(
      (row) =>
        row.accreditation.id === linkedAccreditation.id &&
        row.month === '2026-02'
    )
    expect(februaryRow).toMatchObject({
      organisation: { id: org.id, reference: '500123' },
      accreditation: {
        id: linkedAccreditation.id,
        processingType: 'reprocessor',
        material: 'plastic'
      },
      tonnage: {
        totalCredited: 100,
        eligibleForWasteBalance: 100,
        sentOnDeductions: 0
      }
    })
    expect(
      body.data.every((row) => row.organisation.reference === '500123')
    ).toBe(true)

    await server.stop()
  })
})
