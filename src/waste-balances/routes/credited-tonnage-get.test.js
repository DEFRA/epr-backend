import { ObjectId } from 'mongodb'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asOperator, asServiceMaintainerRead } from '#test/inject-auth.js'
import { partialMock } from '#test/type-helpers.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { organisationReadRepositoryOf } from '#vite/helpers/organisation-read-model.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { buildSummaryLogRowStateEntry } from '#waste-records/repository/test-data.js'
import { buildExternalAccreditation } from '#organisation-read-model/repository/contract/test-data.js'
import { toYear } from '#common/helpers/dates/year.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import {
  buildRegistration,
  createOrganisationBuilders
} from '#repositories/organisations/contract/test-data.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { creditedTonnageGetPath } from './credited-tonnage-get.js'
import { toSummaryLogFileId } from '#domain/summary-logs/ids.js'

const { buildOrganisationWithRegistration } = createOrganisationBuilders()

const SUMMARY_LOG_ID = 'sl-credited-1'

const injectReport = (server, credentials) =>
  server.inject({
    method: 'GET',
    url: creditedTonnageGetPath,
    ...credentials
  })

/**
 * The read model serves only an approved registration.
 *
 * @param {Record<string, any>} registration
 */
const approvedFrom2026 = (registration) => {
  registration.validFrom = '2026-01-01'
  registration.statusHistory = [
    { status: 'created', updatedAt: '2025-11-01' },
    { status: 'approved', updatedAt: '2026-01-01' }
  ]
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
    const accreditationId = new ObjectId().toString()
    const registration = buildRegistration({
      accreditationId,
      registrationNumber: toRegistrationNumber('REG500123'),
      wasteProcessingType: 'reprocessor',
      reprocessingType: 'input',
      material: 'plastic'
    })
    const org = buildOrganisationWithRegistration(
      partialMock(registration),
      'approved'
    )
    org.organisationNumber = toOrganisationNumber('500123')

    const linkedRegistration = org.registrations[0]
    approvedFrom2026(linkedRegistration)
    const linkedAccreditation = org.accreditations[0]
    linkedAccreditation.validFrom = '2026-01-01'
    linkedAccreditation.validTo = '2026-12-31'
    linkedAccreditation.accreditationNumber = toAccreditationNumber('ACC500123')
    const ledgerId = {
      organisationId: org.id,
      registrationId: linkedRegistration.id,
      accreditationId: linkedAccreditation.id,
      organisationNumber: org.organisationNumber,
      registrationNumber: toRegistrationNumber('REG500123'),
      accreditationNumber: linkedAccreditation.accreditationNumber
    }

    const server = await serverWithFebruarySubmission({
      organisationReadRepository: await organisationReadRepositoryOf([org]),
      ledgerId
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
    const registrationNumber = toRegistrationNumber('REG500124')
    const accreditationNumber = toAccreditationNumber('ACC-EXT-500124')
    const registration = buildRegistration({
      registrationNumber,
      wasteProcessingType: 'reprocessor',
      reprocessingType: 'input',
      material: 'plastic'
    })
    const org = buildOrganisationWithRegistration(partialMock(registration))
    org.organisationNumber = toOrganisationNumber('500124')
    approvedFrom2026(org.registrations[0])

    const externalAccreditation = buildExternalAccreditation({
      registrationNumber,
      year: toYear(2026),
      accreditationNumber,
      status: {
        current: 'approved',
        timeline: [
          {
            status: 'approved',
            at: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z'
          }
        ]
      }
    })
    const server = await serverWithFebruarySubmission({
      organisationReadRepository: await organisationReadRepositoryOf([org], {
        externalAccreditations: [externalAccreditation]
      }),
      ledgerId: {
        organisationNumber: org.organisationNumber,
        registrationNumber,
        accreditationNumber
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
