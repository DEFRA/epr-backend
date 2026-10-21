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
import { granted } from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'

/** @import { LedgerEvent } from '#waste-balances/repository/ledger-schema.js' */

const ORGANISATION_ID = 'org-1'
const ORGANISATION_NUMBER = 500123
const REGISTRATION_ID = 'reg-1'
const REGISTRATION_NUMBER = 'R26ER5000000002PA'
const FILE_ID = 'file-1'
const SUBMITTED_AT = '2026-09-11T09:15:42.318Z'

const buildRegistration = () => {
  const [, exporterRegistration] = buildReadOrganisation().registrations
  return {
    ...exporterRegistration,
    id: REGISTRATION_ID,
    material: 'plastic',
    submittedToRegulator: 'ea',
    registrationNumber: REGISTRATION_NUMBER,
    accreditation: null,
    overseasSites: {},
    status: REGISTRATION_STATUS.APPROVED,
    statusHistory: granted('approved'),
    validFrom: '2026-02-01'
  }
}

const receivedRowState = () => ({
  rowId: '1001',
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
  data: { DATE_RECEIVED_FOR_REPROCESSING: '2026-02-01' },
  classification: {
    outcome: WASTE_BALANCE_OUTCOME.NOT_APPLICABLE,
    reasons: [],
    transactionAmount: 0
  }
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
 * row-state adapters, so the route's own wiring is what is under test. An
 * empty `ledgerEvents` stands for a registration that has never submitted.
 *
 * @param {{ ledgerEvents?: LedgerEvent[] }} [options]
 */
const createServer = async ({
  ledgerEvents = /** @type {LedgerEvent[]} */ ([
    buildLedgerEvent({
      organisationId: ORGANISATION_ID,
      registrationId: REGISTRATION_ID,
      accreditationId: null,
      payload: { summaryLogId: FILE_ID, creditTotal: 0 }
    })
  ])
} = {}) => {
  const organisation = buildReadOrganisation({
    id: ORGANISATION_ID,
    orgId: toOrganisationNumber(ORGANISATION_NUMBER),
    companyDetails: { name: 'Acme Ltd' },
    submittedToRegulator: 'ea',
    registrations: [/** @type {any} */ (buildRegistration())]
  })

  const summaryLogRowStatesRepository =
    createInMemorySummaryLogRowStatesRepository()()
  await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
    {
      organisationId: ORGANISATION_ID,
      registrationId: REGISTRATION_ID,
      accreditationId: null
    },
    [receivedRowState()],
    FILE_ID
  )

  return createTestServer({
    repositories: {
      // The export serves the records the path resolved, so nothing reads
      // them again by id.
      organisationsRepository: () => ({
        findAll: vi.fn().mockResolvedValue([organisation]),
        findById: vi.fn(() => Promise.reject(new Error('read again'))),
        findByOrgId: vi.fn((orgId) =>
          Promise.resolve(orgId === organisation.orgId ? organisation : null)
        ),
        findRegistrationById: vi.fn(() =>
          Promise.reject(new Error('read again'))
        )
      }),
      summaryLogRowStatesRepository: () => summaryLogRowStatesRepository,
      ledgerRepository: () => createInMemoryLedgerRepository(ledgerEvents)(),
      summaryLogsRepository: () => ({
        findAllByOrgReg: vi
          .fn()
          .mockResolvedValue([submittedLog(FILE_ID, SUBMITTED_AT)])
      }),
      overseasSitesRepository: () => ({
        findAll: vi.fn().mockResolvedValue([])
      })
    }
  })
}

const registrations = `/organisations/${ORGANISATION_NUMBER}/registrations`
const url = `${registrations}/${REGISTRATION_NUMBER}/waste-records/export.csv`

describe('GET /organisations/{organisationNumber}/registrations/{registrationNumber}/waste-records/export.csv', () => {
  setupAuthContext()

  it('streams the latest records of the registration as CSV', async () => {
    const server = await createServer()

    const response = await server.inject({
      method: 'GET',
      url,
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

  it('names the download by registration number and the moment of export', async () => {
    const server = await createServer()

    const response = await server.inject({
      method: 'GET',
      url,
      ...asServiceMaintainer()
    })

    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="R26ER5000000002PA-\d{4}-\d{2}-\d{2}-\d{6}\.csv"$/
    )
  })

  it('serves a header-only CSV for a registration that has never submitted', async () => {
    const server = await createServer({ ledgerEvents: [] })

    const response = await server.inject({
      method: 'GET',
      url,
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const lines = response.payload.split('\n').filter((line) => line !== '')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('Organisation Name')
  })

  it.each([
    [
      'an unknown organisation number',
      `/organisations/999999/registrations/${REGISTRATION_NUMBER}/waste-records/export.csv`
    ],
    [
      'a registration number the organisation does not serve',
      `${registrations}/R26XX0000000000PL/waste-records/export.csv`
    ]
  ])('returns 404 for %s', async (_, exportUrl) => {
    const server = await createServer()

    const response = await server.inject({
      method: 'GET',
      url: exportUrl,
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  describe('authorisation', () => {
    it('returns 401 when not authenticated', async () => {
      const server = await createServer()

      const response = await server.inject({ method: 'GET', url })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 when the caller holds neither scope', async () => {
      const server = await createServer()

      const response = await server.inject({
        method: 'GET',
        url,
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
        url,
        ...asServiceMaintainer({ scope })
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('serves a caller holding both scopes and no admin scope', async () => {
      const server = await createServer()

      const response = await server.inject({
        method: 'GET',
        url,
        ...asServiceMaintainer({
          scope: ['summary-log.read', 'organisation.read']
        })
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })
  })
})
