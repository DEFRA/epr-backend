import { StatusCodes } from 'http-status-codes'

import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { buildStreamEvent } from '#waste-balances/repository/stream-test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer, asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import { getWasteRecordsExportPath, wasteRecordsExportRoute } from './export.js'

const accreditationFixture = {
  id: 'acc-1',
  status: 'approved',
  accreditationNumber: 'ACC-001',
  validFrom: '2026-01-01',
  validTo: '2026-12-31',
  statusHistory: []
}

const buildOrganisation = (overrides = {}) => ({
  id: 'org-1',
  orgId: 123456,
  companyDetails: { name: 'Acme Ltd' },
  submittedToRegulator: 'ea',
  registrations: [],
  accreditations: [accreditationFixture],
  ...overrides
})

const buildRegistration = (overrides = {}) => ({
  id: 'reg-1',
  material: 'plastic',
  submittedToRegulator: 'ea',
  accreditationId: 'acc-1',
  ...overrides
})

const PARTITION = {
  organisationId: 'org-1',
  registrationId: 'reg-1',
  accreditationId: 'acc-1'
}

const includedReceivedEntry = (overrides = {}) => ({
  rowId: '1001',
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  data: {
    processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
    DATE_RECEIVED_FOR_REPROCESSING: '2026-02-01'
  },
  classification: {
    outcome: ROW_OUTCOME.INCLUDED,
    reasons: [],
    transactionAmount: 10
  },
  ...overrides
})

/**
 * @param {{ organisations?: any[], committed?: any[], summaryLogs?: any[], observedKeys?: string[] }} [opts]
 */
const createServerWithRepos = async ({
  organisations = [],
  committed = [],
  summaryLogs = [],
  observedKeys = []
} = {}) => {
  const organisationsRepository = {
    findAll: vi.fn().mockResolvedValue(organisations)
  }
  const wasteRecordsRepository = {
    findDistinctDataKeys: vi.fn().mockResolvedValue(observedKeys)
  }
  const summaryLogsRepository = {
    findAllByOrgReg: vi.fn().mockResolvedValue(summaryLogs)
  }

  const server = await createTestServer({
    repositories: {
      organisationsRepository: () => organisationsRepository,
      wasteRecordsRepository: () => wasteRecordsRepository,
      summaryLogsRepository: () => summaryLogsRepository
    }
  })

  const rowStateRepository =
    /** @type {import('#waste-balances/repository/row-states-port.js').RowStateRepository} */ (
      server.app.rowStateRepository
    )
  const streamRepository =
    /** @type {import('#waste-balances/repository/stream-port.js').WasteBalanceStreamRepository} */ (
      server.app.streamRepository
    )
  for (const submission of committed) {
    await rowStateRepository.upsertRowStates(
      PARTITION,
      submission.entries,
      submission.summaryLogId
    )
    await streamRepository.appendEvent(
      buildStreamEvent({
        number: submission.number,
        payload: { summaryLogId: submission.summaryLogId, creditTotal: 100 }
      })
    )
  }

  return server
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
      expect(lines[0]).toContain('Organisation Name')
      expect(lines[0]).toContain('Regulator')
    })

    it('streams a header row plus one data row for a single committed row state', async () => {
      const organisation = buildOrganisation({
        registrations: [buildRegistration()]
      })
      const server = await createServerWithRepos({
        organisations: [organisation],
        committed: [
          {
            summaryLogId: 'log-1',
            number: 1,
            entries: [includedReceivedEntry()]
          }
        ],
        summaryLogs: [
          { id: 'log-1', summaryLog: { submittedAt: '2026-04-15T09:00:00Z' } }
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

  describe('streaming response shape', () => {
    it('returns a body composed of multiple CSV-encoded lines from the underlying stream', async () => {
      const organisation = buildOrganisation({
        registrations: [buildRegistration()]
      })
      const server = await createServerWithRepos({
        organisations: [organisation],
        committed: [
          {
            summaryLogId: 'log-1',
            number: 1,
            entries: [includedReceivedEntry()]
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
        ...asStandardUser({ linkedOrgId: 'org-123' })
      })

      await server.stop()

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })
})
