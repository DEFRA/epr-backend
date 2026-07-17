import { StatusCodes } from 'http-status-codes'

import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'

/** @import { LedgerEvent } from '#waste-balances/repository/ledger-schema.js' */
import { createInMemorySummaryLogRowStateRepository } from '#waste-records/repository/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer, asOperator } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import { getWasteRecordsExportPath, wasteRecordsExportRoute } from './export.js'

const buildOrganisation = (overrides = {}) => ({
  id: 'org-1',
  companyDetails: { name: 'Acme Ltd' },
  submittedToRegulator: 'ea',
  registrations: [],
  ...overrides
})

const buildRegistration = (overrides = {}) => ({
  id: 'reg-1',
  material: 'plastic',
  submittedToRegulator: 'ea',
  accreditation: null,
  overseasSites: {},
  ...overrides
})

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
 * Stand up a test server whose export reads from the real in-memory ledger and
 * row-state adapters. `seeds` records each registration's submitted summary log
 * and its committed rows, so the export resolves that summary log as the
 * registration's latest and reads its rows.
 *
 * @param {{
 *   organisations?: any[],
 *   seeds?: any[],
 *   summaryLogs?: any[],
 *   overseasSites?: any[]
 * }} [options]
 */
const createServerWithRepos = async ({
  organisations = [],
  seeds = [],
  summaryLogs = [],
  overseasSites = []
} = {}) => {
  const organisationsRepository = {
    findAll: vi.fn().mockResolvedValue(organisations),
    findById: vi.fn().mockResolvedValue(organisations[0])
  }

  const ledgerRepository = createInMemoryLedgerRepository(
    /** @type {LedgerEvent[]} */ (
      seeds.map((seed) =>
        buildLedgerEvent({
          organisationId: seed.organisationId ?? 'org-1',
          registrationId: seed.registrationId ?? 'reg-1',
          accreditationId: seed.accreditationId ?? null,
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
    createInMemorySummaryLogRowStateRepository()()
  for (const seed of seeds) {
    await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
      {
        organisationId: seed.organisationId ?? 'org-1',
        registrationId: seed.registrationId ?? 'reg-1',
        accreditationId: seed.accreditationId ?? null
      },
      seed.rows ?? [],
      seed.summaryLogId ?? DEFAULT_SUMMARY_LOG_ID
    )
  }

  const summaryLogsRepository = {
    findAllByOrgReg: vi.fn().mockResolvedValue(summaryLogs)
  }
  const overseasSitesRepository = {
    findAll: vi.fn().mockResolvedValue(overseasSites)
  }

  return createTestServer({
    repositories: {
      organisationsRepository: () => organisationsRepository,
      summaryLogRowStatesRepository: () => summaryLogRowStatesRepository,
      ledgerRepository: () => ledgerRepository,
      summaryLogsRepository: () => summaryLogsRepository,
      overseasSitesRepository: () => overseasSitesRepository
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
        /^attachment; filename="waste-records-.+\.csv"$/
      )

      const lines = response.payload.split('\n').filter((line) => line !== '')
      expect(lines).toHaveLength(1)
      // Header includes well-known metadata column names
      expect(lines[0]).toContain('Organisation Name')
      expect(lines[0]).toContain('Regulator')
    })

    it('streams a header row plus one data row for a single waste record', async () => {
      const organisation = buildOrganisation({
        registrations: [buildRegistration()]
      })
      const server = await createServerWithRepos({
        organisations: [organisation],
        seeds: [{ rows: [receivedRowState()] }],
        summaryLogs: [
          {
            id: 'sl-1',
            summaryLog: { submittedAt: '2026-04-15T09:00:00Z' }
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

  describe('scoped to a single registration', () => {
    it('fetches the organisation by id and filenames the download with it', async () => {
      const organisation = buildOrganisation({
        registrations: [buildRegistration()]
      })
      const server = await createServerWithRepos({
        organisations: [organisation],
        seeds: [{ rows: [receivedRowState()] }]
      })

      const response = await server.inject({
        method: 'GET',
        url: `${getWasteRecordsExportPath}?organisationId=org-1&registrationId=reg-1`,
        ...asServiceMaintainer()
      })

      await server.stop()

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(response.headers['content-disposition']).toMatch(
        /^attachment; filename="waste-records-org-1-.+\.csv"$/
      )

      const lines = response.payload.split('\n').filter((line) => line !== '')
      expect(lines).toHaveLength(2)
      expect(lines[1]).toContain('Acme Ltd')
    })

    it('excludes records for registrations other than the requested one', async () => {
      const organisation = buildOrganisation({
        registrations: [
          buildRegistration({ id: 'reg-1' }),
          buildRegistration({ id: 'reg-2' })
        ]
      })
      const server = await createServerWithRepos({
        organisations: [organisation],
        seeds: [{ rows: [receivedRowState()] }]
      })

      const response = await server.inject({
        method: 'GET',
        url: `${getWasteRecordsExportPath}?organisationId=org-1&registrationId=reg-1`,
        ...asServiceMaintainer()
      })

      await server.stop()

      expect(response.statusCode).toBe(StatusCodes.OK)
      // Only reg-1's records are fetched; reg-2 is filtered out before query.
      const lines = response.payload.split('\n').filter((line) => line !== '')
      expect(lines).toHaveLength(2)
    })

    it('rejects a registrationId without an organisationId', async () => {
      const server = await createServerWithRepos()

      const response = await server.inject({
        method: 'GET',
        url: `${getWasteRecordsExportPath}?registrationId=reg-1`,
        ...asServiceMaintainer()
      })

      await server.stop()

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })

  describe('streaming response shape', () => {
    it('returns a body composed of multiple CSV-encoded lines from the underlying stream', async () => {
      const organisation = buildOrganisation({
        registrations: [buildRegistration()]
      })
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
