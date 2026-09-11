import { StatusCodes } from 'http-status-codes'

import { REGISTRATION_STATUS } from '#domain/organisations/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { buildReadOrganisation } from '#repositories/organisations/contract/test-data.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import { summaryLogRecordsCsv, summaryLogRecordsCsvPath } from './get.js'

/** @import { LedgerEvent } from '#waste-balances/repository/ledger-schema.js' */

const mockAuditSummaryLogDownload = vi.fn()

vi.mock('#root/auditing/summary-logs.js', () => ({
  auditSummaryLogDownload: (...args) => mockAuditSummaryLogDownload(...args)
}))

const ORGANISATION_ID = 'org-1'
const REGISTRATION_ID = 'reg-1'
const FILE_ID = 'file-1'
const SUBMITTED_AT = '2026-09-11T09:15:42.318Z'

const buildRegistration = (overrides = {}) => {
  const [, exporterRegistration] = buildReadOrganisation().registrations
  return {
    ...exporterRegistration,
    id: REGISTRATION_ID,
    material: 'plastic',
    submittedToRegulator: 'ea',
    registrationNumber: 'R26ER5000000002PA',
    accreditation: null,
    overseasSites: {},
    status: REGISTRATION_STATUS.CREATED,
    ...overrides
  }
}

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

const submittedLog = (fileId, submittedAt) => ({
  id: `doc-${fileId}`,
  version: 1,
  summaryLog: summaryLogFactory.submitted({
    file: { id: fileId },
    submittedAt
  })
})

/**
 * Stand up a server whose export reads from the real in-memory ledger and
 * row-state adapters, so the route's own wiring is what is under test.
 *
 * @param {{
 *   summaryLogs?: any[],
 *   rows?: any[],
 *   registration?: any,
 *   findRegistrationById?: () => Promise<any>
 * }} [options]
 */
const createServer = async ({
  summaryLogs = [submittedLog(FILE_ID, SUBMITTED_AT)],
  rows = [receivedRowState()],
  registration = buildRegistration(),
  findRegistrationById = () => Promise.resolve(registration)
} = {}) => {
  const organisation = buildReadOrganisation({
    id: ORGANISATION_ID,
    companyDetails: { name: 'Acme Ltd' },
    submittedToRegulator: 'ea',
    registrations: [registration]
  })

  const summaryLogRowStatesRepository =
    createInMemorySummaryLogRowStatesRepository()()
  await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
    {
      organisationId: ORGANISATION_ID,
      registrationId: REGISTRATION_ID,
      accreditationId: null
    },
    rows,
    FILE_ID
  )

  return createTestServer({
    repositories: {
      organisationsRepository: () => ({
        findAll: vi.fn().mockResolvedValue([organisation]),
        findById: vi.fn().mockResolvedValue(organisation),
        findRegistrationById: vi.fn(findRegistrationById)
      }),
      summaryLogRowStatesRepository: () => summaryLogRowStatesRepository,
      ledgerRepository: () =>
        createInMemoryLedgerRepository(
          /** @type {LedgerEvent[]} */ ([
            buildLedgerEvent({
              organisationId: ORGANISATION_ID,
              registrationId: REGISTRATION_ID,
              accreditationId: null,
              payload: { summaryLogId: FILE_ID, creditTotal: 0 }
            })
          ])
        )(),
      summaryLogsRepository: () => ({
        findAllByOrgReg: vi.fn().mockResolvedValue(summaryLogs)
      }),
      overseasSitesRepository: () => ({
        findAll: vi.fn().mockResolvedValue([])
      })
    }
  })
}

const urlFor = (fileId = FILE_ID) =>
  `/v1/organisations/${ORGANISATION_ID}/registrations/${REGISTRATION_ID}/summary-logs/files/${fileId}/records.csv`

describe(`GET ${summaryLogRecordsCsvPath}`, () => {
  setupAuthContext()

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('is registered at the stated path', () => {
    expect(summaryLogRecordsCsv.method).toBe('GET')
    expect(summaryLogRecordsCsv.path).toBe(summaryLogRecordsCsvPath)
    expect(summaryLogRecordsCsvPath).toBe(
      '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/files/{fileId}/records.csv'
    )
  })

  it('streams the submission as CSV', async () => {
    const server = await createServer()

    const response = await server.inject({
      method: 'GET',
      url: urlFor(),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8')

    const lines = response.payload.split('\n').filter((line) => line !== '')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('Organisation Name')
    expect(lines[1]).toContain('Acme Ltd')
    expect(lines[1]).toContain('1001')
  })

  it('names the download by registration number and the moment of submission', async () => {
    const server = await createServer()

    const response = await server.inject({
      method: 'GET',
      url: urlFor(),
      ...asServiceMaintainer()
    })

    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="R26ER5000000002PA-2026-09-11-091542.csv"'
    )
  })

  it('serves the download unnamed when the registration number cannot be read', async () => {
    const server = await createServer({
      findRegistrationById: () => Promise.reject(new Error('no registration'))
    })

    const response = await server.inject({
      method: 'GET',
      url: urlFor(),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(response.headers['content-disposition']).toBeUndefined()
    expect(response.payload).toContain('Acme Ltd')
  })

  it('audits the download', async () => {
    const server = await createServer()

    await server.inject({
      method: 'GET',
      url: urlFor(),
      ...asServiceMaintainer()
    })

    expect(mockAuditSummaryLogDownload).toHaveBeenCalledWith(
      expect.anything(),
      {
        summaryLogId: FILE_ID,
        organisationId: ORGANISATION_ID,
        registrationId: REGISTRATION_ID
      }
    )
  })

  describe('when this registration never submitted that file', () => {
    it('returns 404 rather than an empty CSV', async () => {
      const server = await createServer()

      const response = await server.inject({
        method: 'GET',
        url: urlFor('file-unknown'),
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      expect(response.headers['content-type']).not.toContain('text/csv')
    })

    it('returns 404 for a file that was uploaded but never submitted', async () => {
      const server = await createServer({
        summaryLogs: [
          {
            id: `doc-${FILE_ID}`,
            version: 1,
            summaryLog: summaryLogFactory.invalid({ file: { id: FILE_ID } })
          }
        ]
      })

      const response = await server.inject({
        method: 'GET',
        url: urlFor(),
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('does not audit a download it refused', async () => {
      const server = await createServer()

      await server.inject({
        method: 'GET',
        url: urlFor('file-unknown'),
        ...asServiceMaintainer()
      })

      expect(mockAuditSummaryLogDownload).not.toHaveBeenCalled()
    })
  })

  describe('authorisation', () => {
    it('returns 401 when not authenticated', async () => {
      const server = await createServer()

      const response = await server.inject({ method: 'GET', url: urlFor() })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 when the caller holds neither scope', async () => {
      const server = await createServer()

      const response = await server.inject({
        method: 'GET',
        url: urlFor(),
        ...asServiceMaintainer({ scope: ['standardUser'] })
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it.each([
      ['summary-log.read alone', ['summary-log.read']],
      ['organisation.read alone', ['organisation.read']]
    ])('returns 403 for a caller holding %s', async (_, scope) => {
      const server = await createServer()

      const response = await server.inject({
        method: 'GET',
        url: urlFor(),
        ...asServiceMaintainer({ scope })
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('serves a caller holding both scopes and no admin scope', async () => {
      const server = await createServer()

      const response = await server.inject({
        method: 'GET',
        url: urlFor(),
        ...asServiceMaintainer({
          scope: ['summary-log.read', 'organisation.read']
        })
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })
  })
})
