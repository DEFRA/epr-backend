import { StatusCodes } from 'http-status-codes'

import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer, asStandardUser } from '#test/inject-auth.js'
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

const buildReceivedRecord = (overrides = {}) => ({
  type: WASTE_RECORD_TYPE.RECEIVED,
  rowId: '1001',
  data: {
    processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
    DATE_RECEIVED_FOR_REPROCESSING: '2026-02-01'
  },
  versions: [{ summaryLog: { id: 'sl-1' } }],
  ...overrides
})

/**
 * @param {{
 *   organisations?: any[],
 *   wasteRecords?: any[],
 *   summaryLogs?: any[],
 *   overseasSites?: any[]
 * }} [options]
 */
const createServerWithRepos = ({
  organisations = [],
  wasteRecords = [],
  summaryLogs = [],
  overseasSites = []
} = {}) => {
  const organisationsRepository = {
    findAll: vi.fn().mockResolvedValue(organisations),
    findById: vi.fn().mockResolvedValue(organisations[0])
  }
  const observedKeys = new Set()
  for (const record of wasteRecords) {
    for (const key of Object.keys(record.data ?? {})) {
      observedKeys.add(key)
    }
  }
  const wasteRecordsRepository = {
    findByRegistration: vi.fn().mockResolvedValue(wasteRecords),
    findDistinctDataKeys: vi.fn().mockResolvedValue([...observedKeys])
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
      wasteRecordsRepository: () => wasteRecordsRepository,
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
        wasteRecords: [buildReceivedRecord()],
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
        wasteRecords: [buildReceivedRecord()]
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
        wasteRecords: [buildReceivedRecord()]
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
        wasteRecords: [buildReceivedRecord()]
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
        ...asStandardUser({ linkedOrgId: 'org-123' })
      })

      await server.stop()

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })
})
