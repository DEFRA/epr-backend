import { StatusCodes } from 'http-status-codes'

import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import {
  buildDataFieldColumns,
  buildSubmissionHeaderRow
} from '#waste-records-export/domain/csv-columns.js'
import { encodeRow } from '#waste-records-export/application/stream-csv-export.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryOrganisationReadRepository } from '#organisation-read-model/repository/inmemory.js'
import {
  buildReadExporterRegistration,
  buildReadOrganisation
} from '#organisation-read-model/repository/read-model-test-data.js'
import { createMockLogger } from '#test/mock-logger.js'
import { withNumbers } from '#waste-records/repository/test-data.js'
import { toSummaryLogFileId } from '#domain/summary-logs/ids.js'
import { toRegistrationNumber } from '#domain/organisations/numbers.js'

/** @import { RegistrationNumber } from '#domain/organisations/numbers.js' */

const mockAuditSummaryLogDownload = vi.fn()

vi.mock('#root/auditing/summary-logs.js', () => ({
  auditSummaryLogDownload: (...args) => mockAuditSummaryLogDownload(...args)
}))

const ORGANISATION_ID = 'org-1'
const REGISTRATION_ID = 'reg-1'
const FILE_ID = 'file-1'
const SUBMITTED_AT = '2026-09-11T09:15:42.318Z'

const REGISTRATION_NUMBER = toRegistrationNumber('R26ER5000000002PA')

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
 * adapter, so the route's own wiring is what is under test. The read model
 * serves the organisation as it stands at each request, so a test can change
 * it between requests.
 *
 * @param {{
 *   summaryLogs?: any[],
 *   rows?: any[],
 *   accreditationId?: string | null,
 *   registrationNumber?: RegistrationNumber,
 *   readModelHolds?: (organisation: any) => any
 * }} [options]
 */
const createServer = async ({
  summaryLogs = [submittedLog(FILE_ID, SUBMITTED_AT)],
  rows = [receivedRowState()],
  accreditationId = null,
  registrationNumber = REGISTRATION_NUMBER,
  readModelHolds = (organisation) => organisation
} = {}) => {
  const organisation = buildReadOrganisation({
    name: 'Acme Ltd',
    registrations: {
      [registrationNumber]: buildReadExporterRegistration()
    }
  })

  const summaryLogRowStatesRepository =
    createInMemorySummaryLogRowStatesRepository()()
  await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
    {
      ...withNumbers({
        organisationId: ORGANISATION_ID,
        registrationId: REGISTRATION_ID,
        accreditationId
      }),
      organisationNumber: organisation.organisationNumber,
      registrationNumber
    },
    rows,
    toSummaryLogFileId(FILE_ID)
  )

  const summaryLogsRepository =
    createInMemorySummaryLogsRepository()(createMockLogger())
  for (const { id, summaryLog } of summaryLogs) {
    await summaryLogsRepository.insert(id, {
      ...summaryLog,
      organisationNumber: organisation.organisationNumber,
      registrationNumber
    })
  }

  const server = await createTestServer({
    repositories: {
      organisationReadRepository: () =>
        createInMemoryOrganisationReadRepository(
          [readModelHolds(organisation)].filter(Boolean)
        )(),
      summaryLogRowStatesRepository: () => summaryLogRowStatesRepository,
      summaryLogsRepository: () => summaryLogsRepository
    }
  })

  const { organisationNumber } = organisation
  /** @param {string} [fileId] */
  const urlFor = (fileId = FILE_ID) =>
    `/organisations/${organisationNumber}/registrations/${registrationNumber}/summary-logs/files/${fileId}/records.csv`

  return { server, organisation, summaryLogRowStatesRepository, urlFor }
}

describe('GET /organisations/{organisationNumber}/registrations/{registrationNumber}/summary-logs/files/{fileId}/records.csv', () => {
  setupAuthContext()

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('streams the submission as CSV', async () => {
    const { server, urlFor } = await createServer()

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
    const { server, urlFor } = await createServer()

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
    const { server, urlFor } = await createServer({
      registrationNumber: toRegistrationNumber('R26ER5999999999PA')
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
    const { server, urlFor } = await createServer({
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
    ['organisation', () => null],
    ['registration', (organisation) => ({ ...organisation, registrations: {} })]
  ])(
    'returns 404 and does not audit when the read model no longer holds the %s',
    async (_, readModelHolds) => {
      const { server, urlFor } = await createServer({ readModelHolds })

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
    const { server, organisation, summaryLogRowStatesRepository, urlFor } =
      await createServer({
        accreditationId: 'acc-1',
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

    organisation.registrations[REGISTRATION_NUMBER].material = 'wood'
    await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
      withNumbers({
        organisationId: ORGANISATION_ID,
        registrationId: 'reg-other',
        accreditationId: null
      }),
      [receivedRowState({ data: { A_KEY_ADDED_LATER: 'x' } })],
      toSummaryLogFileId('file-other')
    )

    const after = await download()

    expect(before.statusCode).toBe(StatusCodes.OK)
    expect(before.payload).toContain('A26ER5000000002PA')
    expect(after.payload).toBe(before.payload)
    expect(after.headers['content-disposition']).toBe(
      before.headers['content-disposition']
    )
  })

  it('audits the download by the numbers of its organisation, registration and accreditation', async () => {
    const accredited = submittedLog(FILE_ID, SUBMITTED_AT)
    const { server, organisation, urlFor } = await createServer({
      summaryLogs: [
        {
          ...accredited,
          summaryLog: {
            ...accredited.summaryLog,
            accreditationId: 'acc-1',
            accreditationNumber: 'A26ER5000000002PA'
          }
        }
      ]
    })

    await server.inject({
      method: 'GET',
      url: urlFor(),
      ...asServiceMaintainer()
    })

    expect(mockAuditSummaryLogDownload).toHaveBeenCalledWith(
      expect.anything(),
      {
        summaryLogId: FILE_ID,
        organisationNumber: organisation.organisationNumber,
        registrationNumber: 'R26ER5000000002PA',
        accreditationNumber: 'A26ER5000000002PA'
      }
    )
  })

  describe('when this registration never submitted that file', () => {
    it('returns 404 rather than an empty CSV', async () => {
      const { server, urlFor } = await createServer()

      const response = await server.inject({
        method: 'GET',
        url: urlFor('file-unknown'),
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      expect(response.headers['content-type']).not.toContain('text/csv')
    })

    it('returns 404 for a file that was uploaded but never submitted', async () => {
      const { server, urlFor } = await createServer({
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
      const { server, urlFor } = await createServer()

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
      const { server, urlFor } = await createServer()

      const response = await server.inject({ method: 'GET', url: urlFor() })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 when the caller holds neither scope', async () => {
      const { server, urlFor } = await createServer()

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
      const { server, urlFor } = await createServer()

      const response = await server.inject({
        method: 'GET',
        url: urlFor(),
        ...asServiceMaintainer({ scope })
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('serves a caller holding both scopes and no admin scope', async () => {
      const { server, urlFor } = await createServer()

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
