import { toYear } from '#common/helpers/dates/year.js'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asOperator, asServiceMaintainerRead } from '#test/inject-auth.js'
import { partialMock } from '#test/type-helpers.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryOrganisationReadRepository } from '#organisation-read-model/repository/inmemory.js'
import {
  approvedStatusFrom,
  buildReadAccreditation,
  buildReadOrganisation,
  buildReadReprocessorRegistration
} from '#organisation-read-model/repository/read-model-test-data.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { buildSummaryLogRowStateEntry } from '#waste-records/repository/test-data.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { creditedTonnageGetPath } from './credited-tonnage-get.js'
import { toSummaryLogFileId } from '#domain/summary-logs/ids.js'

const SUMMARY_LOG_ID = 'sl-credited-1'

const injectReport = (server, credentials) =>
  server.inject({
    method: 'GET',
    url: creditedTonnageGetPath,
    ...credentials
  })

/**
 * An organisation the read model serves with one input reprocessor for
 * plastic, approved and accredited from 1 January 2026.
 *
 * @param {string} organisationNumber
 * @param {string} registrationNumber
 * @param {string} accreditationNumber
 */
const accreditedFrom2026 = (
  organisationNumber,
  registrationNumber,
  accreditationNumber
) => {
  const approved = approvedStatusFrom('2026-01-01')
  return buildReadOrganisation({
    organisationNumber: toOrganisationNumber(organisationNumber),
    registrations: {
      [registrationNumber]: buildReadReprocessorRegistration({
        material: 'plastic',
        status: approved,
        standingByDate: {
          2026: { '2026-01-01': { standing: 'accredited' } }
        },
        accreditations: {
          2026: buildReadAccreditation({
            accreditationNumber: toAccreditationNumber(accreditationNumber),
            status: approved
          })
        }
      })
    }
  })
}

/**
 * A server whose ledger has one submission of a 100 tonne row dated February
 * 2026, for the ledger given, and whose read model is `organisationReadRepository`.
 *
 * @param {{
 *   organisationReadRepository: any,
 *   ledgerId: import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId
 * }} options
 */
const serverWithFebruarySubmission = async ({
  organisationReadRepository,
  ledgerId
}) => {
  const summaryLogRowStatesRepository =
    createInMemorySummaryLogRowStatesRepository()()
  await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
    ledgerId,
    [
      buildSummaryLogRowStateEntry({
        rowId: 'row-1',
        wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
        processingType: 'REPROCESSOR_INPUT',
        data: {
          DATE_RECEIVED_FOR_REPROCESSING: '2026-02-10',
          EWC_CODE: '15 01 02',
          DESCRIPTION_WASTE: 'Plastic packaging',
          WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
          GROSS_WEIGHT: 101,
          TARE_WEIGHT: 1,
          PALLET_WEIGHT: 0,
          NET_WEIGHT: 100,
          BAILING_WIRE_PROTOCOL: 'No',
          HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'Sampling',
          WEIGHT_OF_NON_TARGET_MATERIALS: 0,
          RECYCLABLE_PROPORTION_PERCENTAGE: 100,
          TONNAGE_RECEIVED_FOR_RECYCLING: 100
        },
        // Stamped as contributing nothing at submission; the report
        // re-derives against the accreditation as it stands now.
        classification: {
          outcome: WASTE_BALANCE_OUTCOME.EXCLUDED,
          reasons: [],
          transactionAmount: 0
        }
      })
    ],
    toSummaryLogFileId(SUMMARY_LOG_ID)
  )

  const ledgerRepository = createInMemoryLedgerRepository([
    partialMock(
      buildLedgerEvent({
        ...ledgerId,
        number: 1,
        payload: { summaryLogId: SUMMARY_LOG_ID, creditTotal: 100 }
      })
    )
  ])()

  return createTestServer({
    repositories: {
      organisationReadRepository,
      ledgerRepository,
      summaryLogRowStatesRepository
    }
  })
}

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
    const org = accreditedFrom2026('500123', 'REG500123', 'ACC500123')
    const server = await serverWithFebruarySubmission({
      organisationReadRepository: createInMemoryOrganisationReadRepository([
        org
      ]),
      ledgerId: {
        organisationNumber: org.organisationNumber,
        registrationNumber: toRegistrationNumber('REG500123'),
        accreditationNumber: toAccreditationNumber('ACC500123'),
        year: toYear(2026)
      }
    })

    const response = await injectReport(server, asServiceMaintainerRead())

    expect(response.statusCode).toBe(StatusCodes.OK)
    const body = JSON.parse(response.payload)

    const februaryRow = body.data.find(
      (row) =>
        row.accreditation.accreditationNumber === 'ACC500123' &&
        row.month === '2026-02'
    )
    expect(februaryRow).toEqual({
      month: '2026-02',
      organisation: { reference: '500123' },
      accreditation: {
        accreditationNumber: 'ACC500123',
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

  it('returns rows for an accreditation held outside re-ex and known only by its number', async () => {
    const org = accreditedFrom2026('500124', 'REG500124', 'ACC-EXT-500124')
    const server = await serverWithFebruarySubmission({
      organisationReadRepository: createInMemoryOrganisationReadRepository([
        org
      ]),
      ledgerId: {
        organisationNumber: org.organisationNumber,
        registrationNumber: toRegistrationNumber('REG500124'),
        accreditationNumber: toAccreditationNumber('ACC-EXT-500124'),
        year: toYear(2026)
      }
    })

    const response = await injectReport(server, asServiceMaintainerRead())

    expect(response.statusCode).toBe(StatusCodes.OK)
    const februaryRow = JSON.parse(response.payload).data.find(
      (row) =>
        row.accreditation.accreditationNumber === 'ACC-EXT-500124' &&
        row.month === '2026-02'
    )
    expect(februaryRow).toEqual({
      month: '2026-02',
      organisation: { reference: '500124' },
      accreditation: {
        accreditationNumber: 'ACC-EXT-500124',
        processingType: 'reprocessor',
        material: 'plastic'
      },
      tonnage: {
        totalCredited: 100,
        eligibleForWasteBalance: 100,
        sentOnDeductions: 0
      }
    })

    await server.stop()
  })
})
