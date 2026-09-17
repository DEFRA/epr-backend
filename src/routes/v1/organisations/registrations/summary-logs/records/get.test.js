import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { REGISTRATION_STATUS } from '#domain/organisations/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { buildReadOrganisation } from '#repositories/organisations/contract/test-data.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import {
  buildDataFieldColumns,
  buildSubmissionHeaderRow
} from '#waste-records-export/domain/csv-columns.js'
import { encodeRow } from '#waste-records-export/application/stream-csv-export.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import { summaryLogRecordsCsv, summaryLogRecordsCsvPath } from './get.js'

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

const SUBMITTED_META = {
  REGISTRATION_NUMBER: 'R26ER5000000002PA',
  MATERIAL: 'Plastic'
}

const submittedLog = (fileId, submittedAt, meta = SUBMITTED_META) => ({
  id: `doc-${fileId}`,
  version: 1,
  summaryLog: summaryLogFactory.submitted({
    file: { id: fileId },
    submittedAt,
    meta
  })
})

/**
 * Stand up a server whose export reads from the real in-memory row-state
 * adapter, so the route's own wiring is what is under test. The organisation
 * the mocks return is shared by reference, so a test can change it between
 * requests.
 *
 * @param {{
 *   summaryLogs?: any[],
 *   rows?: any[],
 *   accreditationId?: string | null,
 *   accreditations?: any[],
 *   registration?: any,
 *   findById?: () => Promise<any>,
 *   findRegistrationById?: () => Promise<any>
 * }} [options]
 */
const createServer = async ({
  summaryLogs = [submittedLog(FILE_ID, SUBMITTED_AT)],
  rows = [receivedRowState()],
  accreditationId = null,
  accreditations = [],
  registration = buildRegistration(),
  findById,
  findRegistrationById = () => Promise.resolve(registration)
} = {}) => {
  const organisation = buildReadOrganisation({
    id: ORGANISATION_ID,
    companyDetails: { name: 'Acme Ltd' },
    submittedToRegulator: 'ea',
    accreditations,
    registrations: [registration]
  })

  const summaryLogRowStatesRepository =
    createInMemorySummaryLogRowStatesRepository()()
  await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
    {
      organisationId: ORGANISATION_ID,
      registrationId: REGISTRATION_ID,
      accreditationId
    },
    rows,
    FILE_ID
  )

  const server = await createTestServer({
    repositories: {
      organisationsRepository: () => ({
        findById: vi.fn(findById ?? (() => Promise.resolve(organisation))),
        findRegistrationById: vi.fn(findRegistrationById)
      }),
      summaryLogRowStatesRepository: () => summaryLogRowStatesRepository,
      summaryLogsRepository: () => ({
        findAllByOrgReg: vi.fn().mockResolvedValue(summaryLogs)
      })
    }
  })

  return { server, organisation, summaryLogRowStatesRepository }
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
    const { server } = await createServer()

    const response = await server.inject({
      method: 'GET',
      url: urlFor(),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8')

    const lines = response.payload.split('\n').filter((line) => line !== '')
    expect(lines).toHaveLength(2)
    expect(`${lines[0]}\n`).toBe(
      await encodeRow(buildSubmissionHeaderRow(buildDataFieldColumns([])))
    )
    expect(lines[1]).toContain('Acme Ltd')
    expect(lines[1]).toContain('1001')
  })

  it('names the download by registration number and the moment of submission', async () => {
    const { server } = await createServer()

    const response = await server.inject({
      method: 'GET',
      url: urlFor(),
      ...asServiceMaintainer()
    })

    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="R26ER5000000002PA-2026-09-11-091542.csv"'
    )
  })

  it('names the download by the registration number the submission stored, not the current one', async () => {
    const { server } = await createServer({
      registration: buildRegistration({
        registrationNumber: 'R26ER5999999999PA'
      })
    })

    const response = await server.inject({
      method: 'GET',
      url: urlFor(),
      ...asServiceMaintainer()
    })

    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="R26ER5000000002PA-2026-09-11-091542.csv"'
    )
  })

  it('serves the download unnamed when the submission stored no meta', async () => {
    const { server } = await createServer({
      summaryLogs: [
        {
          id: `doc-${FILE_ID}`,
          version: 1,
          summaryLog: summaryLogFactory.submitted({
            file: { id: FILE_ID },
            submittedAt: SUBMITTED_AT
          })
        }
      ]
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

  it.each([
    ['organisation', { findById: () => Promise.reject(Boom.notFound()) }],
    [
      'registration',
      { findRegistrationById: () => Promise.reject(Boom.notFound()) }
    ]
  ])(
    'returns 404 and does not audit when the %s is missing',
    async (_, options) => {
      const { server } = await createServer(options)

      const response = await server.inject({
        method: 'GET',
        url: urlFor(),
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      expect(mockAuditSummaryLogDownload).not.toHaveBeenCalled()
    }
  )

  it('serves the same file after the organisation and other submissions change', async () => {
    const { server, organisation, summaryLogRowStatesRepository } =
      await createServer({
        accreditationId: 'acc-1',
        accreditations: [
          {
            ...buildReadOrganisation().accreditations[0],
            id: 'acc-1',
            status: 'approved',
            accreditationNumber: 'A26ER5000000002PA'
          }
        ],
        registration: buildRegistration({
          accreditationId: 'acc-1',
          overseasSites: { '001': { overseasSiteId: 'site-1' } }
        }),
        summaryLogs: [
          submittedLog(FILE_ID, SUBMITTED_AT, {
            ...SUBMITTED_META,
            ACCREDITATION_NUMBER: 'A26ER5000000002PA'
          })
        ],
        rows: [
          receivedRowState({
            data: {
              DATE_RECEIVED_FOR_REPROCESSING: '2026-02-01',
              OSR_ID: '001'
            },
            classification: {
              outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
              reasons: [],
              transactionAmount: 50.5
            }
          })
        ]
      })
    const download = () =>
      server.inject({ method: 'GET', url: urlFor(), ...asServiceMaintainer() })

    const before = await download()

    const [registration] = organisation.registrations
    registration.registrationNumber = 'R26ER5999999999PA'
    registration.material = 'wood'
    registration.overseasSites = { '001': { overseasSiteId: 'site-2' } }
    organisation.accreditations[0].status = 'cancelled'
    await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
      {
        organisationId: ORGANISATION_ID,
        registrationId: 'reg-other',
        accreditationId: null
      },
      [receivedRowState({ data: { A_KEY_ADDED_LATER: 'x' } })],
      'file-other'
    )

    const after = await download()

    expect(before.statusCode).toBe(StatusCodes.OK)
    expect(before.payload).toContain('A26ER5000000002PA')
    expect(after.payload).toBe(before.payload)
    expect(after.headers['content-disposition']).toBe(
      before.headers['content-disposition']
    )
  })

  it('audits the download', async () => {
    const { server } = await createServer()

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
      const { server } = await createServer()

      const response = await server.inject({
        method: 'GET',
        url: urlFor('file-unknown'),
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      expect(response.headers['content-type']).not.toContain('text/csv')
    })

    it('returns 404 for a file that was uploaded but never submitted', async () => {
      const { server } = await createServer({
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
      const { server } = await createServer()

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
      const { server } = await createServer()

      const response = await server.inject({ method: 'GET', url: urlFor() })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 when the caller holds neither scope', async () => {
      const { server } = await createServer()

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
      const { server } = await createServer()

      const response = await server.inject({
        method: 'GET',
        url: urlFor(),
        ...asServiceMaintainer({ scope })
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('serves a caller holding both scopes and no admin scope', async () => {
      const { server } = await createServer()

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
