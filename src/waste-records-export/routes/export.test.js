import { StatusCodes } from 'http-status-codes'

import {
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'

/** @import { LedgerEvent } from '#waste-balances/repository/ledger-schema.js' */
/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { SummaryLogWithId } from '#repositories/summary-logs/port.js' */
/** @import { SummaryLogRowStateEntry } from '#waste-records/repository/schema.js' */
import { createInMemoryOrganisationReadRepository } from '#organisation-read-model/repository/inmemory.js'
import {
  buildReadExporterRegistration,
  buildReadOrganisation
} from '#organisation-read-model/repository/read-model-test-data.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import { DEFAULT_YEAR } from '#waste-records/repository/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer, asOperator } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import { getWasteRecordsExportPath, wasteRecordsExportRoute } from './export.js'
import { toSummaryLogFileId, toSummaryLogId } from '#domain/summary-logs/ids.js'

const ORGANISATION_NUMBER = toOrganisationNumber('500123')

/**
 * An organisation the read model serves with one approved, registered-only
 * exporter for plastic.
 *
 * @param {string} [registrationNumber]
 * @returns {Organisation}
 */
const organisationWith = (registrationNumber = 'REG-reg-1') =>
  buildReadOrganisation({
    organisationNumber: ORGANISATION_NUMBER,
    name: 'Acme Ltd',
    registrations: {
      [registrationNumber]: buildReadExporterRegistration({
        material: 'plastic'
      })
    }
  })

/**
 * @param {Partial<SummaryLogRowStateEntry>} [overrides]
 * @returns {SummaryLogRowStateEntry}
 */
const receivedRowState = (overrides = {}) => ({
  rowId: '1001',
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
  data: { DATE_RECEIVED_FOR_REPROCESSING: '2026-02-01' },
  classification: {
    outcome: WASTE_BALANCE_OUTCOME.NOT_APPLICABLE,
    reasons: [],
    transactionAmount: 0
  },
  ...overrides
})

const DEFAULT_SUMMARY_LOG_ID = 'sl-1'

/**
 * A registration's submitted summary log and the rows committed under it, on
 * the registered-only ledger of `ORGANISATION_NUMBER`.
 *
 * @typedef {Object} LedgerSeed
 * @property {string} [registrationNumber] - defaults to `buildRegistration`'s
 * @property {string} [summaryLogId]
 * @property {SummaryLogRowStateEntry[]} [rows]
 */

/**
 * Stand up a test server whose export reads from the real in-memory ledger and
 * row-state adapters. `seeds` records each registration's submitted summary log
 * and its committed rows, so the export resolves that summary log as the
 * registration's latest and reads its rows.
 *
 * @param {{
 *   organisations?: Organisation[],
 *   seeds?: LedgerSeed[],
 *   summaryLogs?: SummaryLogWithId[]
 * }} [options]
 */
const createServerWithRepos = async ({
  organisations = [],
  seeds = [],
  summaryLogs = []
} = {}) => {
  /** @param {LedgerSeed} seed */
  const ledgerIdOf = (seed) => ({
    organisationNumber: ORGANISATION_NUMBER,
    registrationNumber: toRegistrationNumber(
      seed.registrationNumber ?? 'REG-reg-1'
    ),
    accreditationNumber: null,
    year: DEFAULT_YEAR
  })

  const ledgerRepository = createInMemoryLedgerRepository(
    /** @type {LedgerEvent[]} */ (
      seeds.map((seed) =>
        buildLedgerEvent({
          ...ledgerIdOf(seed),
          number: 1,
          payload: {
            summaryLogId: seed.summaryLogId ?? DEFAULT_SUMMARY_LOG_ID,
            creditTotal: 0
          }
        })
      )
    )
  )()

  const summaryLogRowStatesRepository =
    createInMemorySummaryLogRowStatesRepository()()
  for (const seed of seeds) {
    await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
      ledgerIdOf(seed),
      seed.rows ?? [],
      toSummaryLogFileId(seed.summaryLogId ?? DEFAULT_SUMMARY_LOG_ID)
    )
  }

  const summaryLogsRepository = {
    findAll: vi.fn().mockResolvedValue(summaryLogs)
  }

  // The export reads the organisation read model alone.
  const readsLegacy = () =>
    Promise.reject(new Error('read the legacy repository'))

  return createTestServer({
    repositories: {
      organisationAdministrationRepository: () => ({ findAll: readsLegacy }),
      organisationReadRepository:
        createInMemoryOrganisationReadRepository(organisations),
      summaryLogRowStatesRepository: () => summaryLogRowStatesRepository,
      ledgerRepository: () => ledgerRepository,
      summaryLogsRepository: () => summaryLogsRepository
    }
  })
}

describe(`GET ${getWasteRecordsExportPath}`, () => {
  setupAuthContext()

  describe('route metadata', () => {
    it('exposes the expected method and path', () => {
      expect(wasteRecordsExportRoute.method).toBe('GET')
      expect(wasteRecordsExportRoute.path).toBe(getWasteRecordsExportPath)
      expect(getWasteRecordsExportPath).toBe(
        '/v1/admin/waste-records/export.csv'
      )
    })
  })

  describe('happy paths', () => {
    it('streams a CSV with only the header row when there is no data', async () => {
      const server = await createServerWithRepos()

      const response = await server.inject({
        method: 'GET',
        url: getWasteRecordsExportPath,
        ...asServiceMaintainer()
      })

      await server.stop()

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8')
      expect(response.headers['content-disposition']).toMatch(
        /^attachment; filename="waste-records-2026-.+\.csv"$/
      )

      const lines = response.payload.split('\n').filter((line) => line !== '')
      expect(lines).toHaveLength(1)
      // Header includes well-known metadata column names
      expect(lines[0]).toContain('Organisation Name')
      expect(lines[0]).toContain('Regulator')
    })

    it('streams a header row plus one data row for a single waste record', async () => {
      const organisation = organisationWith('R26ER5000000002PA')
      const server = await createServerWithRepos({
        organisations: [organisation],
        seeds: [
          {
            registrationNumber: 'R26ER5000000002PA',
            rows: [receivedRowState()]
          }
        ],
        summaryLogs: [
          {
            // The ledger records the submission by its file id, so the
            // document's own id is deliberately something else.
            id: toSummaryLogId('sl-doc-1'),
            version: 1,
            summaryLog: summaryLogFactory.submitted({
              file: { id: DEFAULT_SUMMARY_LOG_ID },
              submittedAt: '2026-04-15T09:00:00Z'
            })
          }
        ]
      })

      const response = await server.inject({
        method: 'GET',
        url: getWasteRecordsExportPath,
        ...asServiceMaintainer()
      })

      await server.stop()

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8')

      const lines = response.payload.split('\n').filter((line) => line !== '')
      expect(lines).toHaveLength(2)
      expect(lines[1]).toContain('Acme Ltd')
      expect(lines[1]).toContain('plastic')
      expect(lines[1]).toContain('1001')
      expect(lines[1]).toContain('2026-04-15T09:00:00Z')
    })
  })

  describe('year', () => {
    it('names the download by the year', async () => {
      const server = await createServerWithRepos()

      const response = await server.inject({
        method: 'GET',
        url: `${getWasteRecordsExportPath}?year=2027`,
        ...asServiceMaintainer()
      })

      await server.stop()

      expect(response.headers['content-disposition']).toMatch(
        /^attachment; filename="waste-records-2027-.+\.csv"$/
      )
    })

    it("serves only the given year's records", async () => {
      const server = await createServerWithRepos({
        organisations: [organisationWith()],
        seeds: [{ rows: [receivedRowState()] }]
      })

      const response = await server.inject({
        method: 'GET',
        url: `${getWasteRecordsExportPath}?year=2027`,
        ...asServiceMaintainer()
      })

      await server.stop()

      expect(response.statusCode).toBe(StatusCodes.OK)
      const lines = response.payload.split('\n').filter((line) => line !== '')
      expect(lines).toHaveLength(1)
    })

    it.each(['2023', '2101', 'next'])(
      'returns 422 for year %s, which the service does not serve',
      async (year) => {
        const server = await createServerWithRepos()

        const response = await server.inject({
          method: 'GET',
          url: `${getWasteRecordsExportPath}?year=${year}`,
          ...asServiceMaintainer()
        })

        await server.stop()

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      }
    )
  })

  describe('scoping', () => {
    it.each([
      ['an organisationId', 'organisationId=org-1'],
      [
        'an organisationId and registrationId',
        'organisationId=org-1&registrationId=reg-1'
      ]
    ])('rejects %s', async (_, query) => {
      const server = await createServerWithRepos()

      const response = await server.inject({
        method: 'GET',
        url: `${getWasteRecordsExportPath}?${query}`,
        ...asServiceMaintainer()
      })

      await server.stop()

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })

  describe('streaming response shape', () => {
    it('returns a body composed of multiple CSV-encoded lines from the underlying stream', async () => {
      const organisation = organisationWith()
      const server = await createServerWithRepos({
        organisations: [organisation],
        seeds: [{ rows: [receivedRowState()] }]
      })

      const response = await server.inject({
        method: 'GET',
        url: getWasteRecordsExportPath,
        ...asServiceMaintainer()
      })

      await server.stop()

      expect(response.statusCode).toBe(StatusCodes.OK)
      // Each generator-yielded chunk ends with its own '\n', so the body must
      // contain at least one internal newline separator on top of the trailing
      // newline of the last row.
      const trimmed = response.payload.replace(/\n$/, '')
      expect(trimmed.split('\n').length).toBeGreaterThan(1)
    })
  })

  describe('auth', () => {
    it('returns 401 when no credentials are supplied', async () => {
      const server = await createServerWithRepos()

      const response = await server.inject({
        method: 'GET',
        url: getWasteRecordsExportPath
      })

      await server.stop()

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 when the caller is a standard user', async () => {
      const server = await createServerWithRepos()

      const response = await server.inject({
        method: 'GET',
        url: getWasteRecordsExportPath,
        ...asOperator()
      })

      await server.stop()

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })
})
