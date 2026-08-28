import { StatusCodes } from 'http-status-codes'
import { ObjectId } from 'mongodb'

import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { waitForVersion } from '#repositories/summary-logs/contract/test-helpers.js'
import { emptyLoadsByReportingPeriod } from '#domain/summary-logs/loads-by-period-status-schema.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { createTestServer } from '#test/create-test-server.js'
import { createMockLogger } from '#test/mock-logger.js'
import { asServiceMaintainer, asUnscopedAdminUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

describe('GET /v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{summaryLogId}/document', () => {
  setupAuthContext()

  const summaryLogId = new ObjectId().toString()
  const organisationId = new ObjectId().toString()
  const registrationId = new ObjectId().toString()

  const meta = {
    PROCESSING_TYPE: 'reprocessor-input',
    TEMPLATE_VERSION: 4,
    MATERIAL: 'Plastic',
    ACCREDITATION_NUMBER: 'EPR123456',
    REGISTRATION_NUMBER: 'R-2026-0099'
  }
  // A populated breakdown: a balance-affecting added load carrying real tonnage
  // in an open period, and a load excluded because its period is already closed.
  // This is the data the endpoint exists to surface, so the test asserts it
  // round-trips intact rather than proving only that an empty shape passes.
  const loadsByReportingPeriod = {
    ...emptyLoadsByReportingPeriod(),
    openPeriodLoads: {
      added: {
        balanceAffecting: {
          count: 1,
          tonnageDelta: 18.5,
          rows: [
            {
              rowId: 'r0002',
              wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
              exclusionReasons: [],
              tonnageDelta: 18.5
            }
          ]
        },
        nonBalanceAffecting: { count: 0, rows: [] }
      },
      adjusted: {
        balanceAffecting: { count: 0, tonnageDelta: 0, rows: [] },
        nonBalanceAffecting: { count: 0, rows: [] }
      }
    },
    closedPeriodLoads: {
      added: {
        balanceAffecting: { count: 0, tonnageDelta: 0, rows: [] },
        nonBalanceAffecting: {
          count: 1,
          rows: [
            {
              rowId: 'r0130',
              wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
              exclusionReasons: ['periodAlreadySubmitted'],
              tonnageDelta: 0
            }
          ]
        }
      },
      adjusted: {
        balanceAffecting: { count: 0, tonnageDelta: 0, rows: [] },
        nonBalanceAffecting: { count: 0, rows: [] }
      }
    }
  }

  const createServer = async (options = {}) => {
    const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
    const summaryLogsRepository =
      summaryLogsRepositoryFactory(createMockLogger())

    const server = await createTestServer({
      repositories: {
        summaryLogsRepository: summaryLogsRepositoryFactory,
        ...options.repositories
      }
    })

    return { server, summaryLogsRepository }
  }

  const makeRequest = (server, logId = summaryLogId) =>
    server.inject({
      method: 'GET',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${logId}/document`,
      ...asServiceMaintainer()
    })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('when the summary log exists', () => {
    it('returns the whole stored document, including fields the operator view strips', async () => {
      const { server, summaryLogsRepository } = await createServer()
      await summaryLogsRepository.insert(
        summaryLogId,
        summaryLogFactory.submitted({ organisationId, registrationId, meta })
      )
      // loadsByReportingPeriod is added by update at validation time, not at
      // insert, so seed it the same way it reaches a real document.
      await summaryLogsRepository.update(summaryLogId, 1, {
        loadsByReportingPeriod
      })
      await waitForVersion(summaryLogsRepository, summaryLogId, 2)

      const response = await makeRequest(server)

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(response.result).toMatchObject({
        version: 2,
        status: 'submitted',
        organisationId,
        registrationId,
        meta,
        loadsByReportingPeriod
      })
      // the populated per-period rows survive the round trip intact, including
      // the balance-affecting tonnage delta and the exclusion reason
      expect(
        response.result.loadsByReportingPeriod.openPeriodLoads.added
          .balanceAffecting.rows
      ).toEqual([
        {
          rowId: 'r0002',
          wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
          exclusionReasons: [],
          tonnageDelta: 18.5
        }
      ])
      expect(
        response.result.loadsByReportingPeriod.closedPeriodLoads.added
          .nonBalanceAffecting.rows[0].exclusionReasons
      ).toEqual(['periodAlreadySubmitted'])
      // file (with its storage uri) is part of the raw document
      expect(response.result.file).toBeDefined()
      expect(response.result.file.uri).toBeDefined()
    })
  })

  describe('when the summary log does not exist', () => {
    it('returns 404', async () => {
      const { server } = await createServer()
      const nonExistentId = new ObjectId().toString()

      const response = await makeRequest(server, nonExistentId)

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('authentication', () => {
    it('returns 401 when not authenticated', async () => {
      const { server } = await createServer()

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/document`
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 when the caller lacks summary-log.read', async () => {
      const { server } = await createServer()

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/document`,
        ...asUnscopedAdminUser()
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('returns 403 when the caller has summary-log.read but not organisation.read', async () => {
      const { server } = await createServer()

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/document`,
        ...asUnscopedAdminUser({ scope: [SCOPES.summaryLogRead] })
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })
})
