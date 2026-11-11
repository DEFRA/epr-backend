import { beforeEach, describe, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { randomUUID } from 'node:crypto'
import { createReportsRepository } from './mongodb.js'
import { testReportsRepositoryContract } from './port.contract.js'
import { buildCreateReportParams } from '#root/reports/repository/contract/test-data.js'
import { createMockDb } from '#test/mock-db.js'
import { createMongoError } from '#test/mongo-error.js'

/**
 * @import { ReportsRepositoryFactory } from './port.js'
 * @typedef {{
 *   mongoClient: MongoClient,
 *   reportsRepository: ReportsRepositoryFactory,
 *   forgetAccreditationNumber: (reportId: string) => Promise<void>
 * }} ReportsFixtures
 */

const DATABASE_NAME = 'epr-backend'
const LEGACY_REPORT_ID = '9f1d3c2a-5b47-4e18-9c60-2d7a8e4f1b03'

const it = /** @type {import('vitest').TestAPI<ReportsFixtures>} */ (
  mongoIt.extend({
    mongoClient: async ({ db }, use) => {
      const client = await MongoClient.connect(db)
      await use(client)
      await client.close()
    },

    reportsRepository: async ({ mongoClient }, use) => {
      const database = mongoClient.db(DATABASE_NAME)
      const factory = await createReportsRepository(database)
      await use(factory)
    },

    forgetAccreditationNumber: async ({ mongoClient }, use) => {
      await use(async (/** @type {string} */ reportId) => {
        await mongoClient
          .db(DATABASE_NAME)
          .collection('reports')
          .updateOne({ id: reportId }, { $unset: { accreditationNumber: '' } })
      })
    }
  })
)

describe('MongoDB reports repository', () => {
  beforeEach(
    /** @param {ReportsFixtures} fixture */ async ({ mongoClient }) => {
      const database = mongoClient.db(DATABASE_NAME)
      await database.collection('reports').deleteMany({})
    }
  )

  it('creates a repository', ({ reportsRepository }) => {
    expect(reportsRepository).toBeDefined()
  })

  describe('reports repository contract', () => {
    testReportsRepositoryContract(it)
  })

  describe('backward compatibility with already-coerced report documents', () => {
    it('resolves the correct start/end-of-day boundary for a report persisted before the bare-date schema fix', /** @param {ReportsFixtures} fixture */ async ({
      mongoClient,
      reportsRepository
    }) => {
      const database = mongoClient.db(DATABASE_NAME)
      await database.collection('reports').insertOne(
        /** @type {any} */ ({
          _id: 'legacy-report-1',
          id: 'legacy-report-1',
          version: 1,
          schemaVersion: 1,
          organisationId: '507f1f77bcf86cd799439011',
          registrationId: '507f1f77bcf86cd799439012',
          year: 2024,
          cadence: 'monthly',
          period: 1,
          submissionNumber: 1,
          startDate: '2024-01-01T00:00:00.000Z',
          endDate: '2024-01-31T00:00:00.000Z',
          dueDate: '2024-02-21T00:00:00.000Z',
          prn: { issuedTonnage: 100 },
          status: {
            currentStatus: 'submitted',
            currentStatusAt: '2024-02-01T00:00:00.000Z',
            submitted: { at: '2024-02-01T00:00:00.000Z', by: { id: 'u' } },
            history: []
          }
        })
      )

      const repository = reportsRepository()
      const [periodicReport] = await repository.findAllPeriodicReports()
      const slot =
        /** @type {NonNullable<typeof periodicReport.reports.monthly>} */ (
          periodicReport.reports.monthly
        )[1]

      expect(slot.startDate).toBe('2024-01-01')
      expect(slot.endDate).toBe('2024-01-31')
      expect(slot.dueDate).toBe('2024-02-21')
    })

    it('returns bare dates from findReportById for a report persisted before the bare-date schema fix', /** @param {ReportsFixtures} fixture */ async ({
      mongoClient,
      reportsRepository
    }) => {
      const database = mongoClient.db(DATABASE_NAME)
      await database.collection('reports').insertOne(
        /** @type {any} */ ({
          _id: 'legacy-report-2',
          id: LEGACY_REPORT_ID,
          version: 1,
          schemaVersion: 1,
          organisationId: '507f1f77bcf86cd799439021',
          registrationId: '507f1f77bcf86cd799439022',
          year: 2024,
          cadence: 'monthly',
          period: 1,
          submissionNumber: 1,
          startDate: '2024-01-01T00:00:00.000Z',
          endDate: '2024-01-31T00:00:00.000Z',
          dueDate: '2024-02-21T00:00:00.000Z',
          status: {
            currentStatus: 'submitted',
            currentStatusAt: '2024-02-01T00:00:00.000Z',
            submitted: { at: '2024-02-01T00:00:00.000Z', by: { id: 'u' } },
            history: []
          }
        })
      )

      const report = await reportsRepository().findReportById(LEGACY_REPORT_ID)

      expect({
        startDate: report.startDate,
        endDate: report.endDate,
        dueDate: report.dueDate
      }).toStrictEqual({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        dueDate: '2024-02-21'
      })
    })

    it('omits the database ids from a report created before they were dropped', /** @param {ReportsFixtures} fixture */ async ({
      mongoClient,
      reportsRepository
    }) => {
      const reportId = randomUUID()
      const database = mongoClient.db(DATABASE_NAME)
      await database.collection('reports').insertOne(
        /** @type {any} */ ({
          _id: reportId,
          id: reportId,
          version: 1,
          schemaVersion: 1,
          organisationId: '507f1f77bcf86cd799439031',
          registrationId: '507f1f77bcf86cd799439032',
          year: 2024,
          cadence: 'monthly',
          period: 1,
          submissionNumber: 1,
          startDate: '2024-01-01T00:00:00.000Z',
          endDate: '2024-01-31T00:00:00.000Z',
          dueDate: '2024-02-21T00:00:00.000Z',
          status: {
            currentStatus: 'submitted',
            currentStatusAt: '2024-02-01T00:00:00.000Z',
            submitted: { at: '2024-02-01T00:00:00.000Z', by: { id: 'u' } },
            history: []
          }
        })
      )

      const report = await reportsRepository().findReportById(reportId)

      expect(report).not.toHaveProperty('organisationId')
      expect(report).not.toHaveProperty('registrationId')
    })
  })

  it('keeps one report per slot by number, and drops the id indexes it replaces', /** @param {ReportsFixtures} fixture */ async ({
    mongoClient
  }) => {
    const database = mongoClient.db(`${DATABASE_NAME}-${randomUUID()}`)
    const collection = database.collection('reports')
    await collection.createIndex({ organisationId: 1, registrationId: 1 })
    await collection.createIndex(
      {
        organisationId: 1,
        registrationId: 1,
        year: 1,
        cadence: 1,
        period: 1,
        submissionNumber: 1
      },
      { unique: true }
    )
    await collection.createIndex(
      { organisationId: 1, registrationId: 1, year: 1, cadence: 1, period: 1 },
      { unique: true, name: 'reports_one_active_draft_per_period' }
    )

    await createReportsRepository(database)

    const indexes = await collection.indexes()
    expect(
      indexes.filter(({ unique }) => unique).map(({ key }) => key)
    ).toStrictEqual([
      { id: 1 },
      {
        organisationNumber: 1,
        registrationNumber: 1,
        year: 1,
        cadence: 1,
        period: 1,
        submissionNumber: 1
      },
      {
        organisationNumber: 1,
        registrationNumber: 1,
        year: 1,
        cadence: 1,
        period: 1
      }
    ])
    expect(indexes.map(({ key }) => key)).not.toContainEqual(
      expect.objectContaining({ organisationId: 1 })
    )
    await database.dropDatabase()
  })

  describe('MongoDB-specific error handling', () => {
    it('re-throws non-duplicate key errors during createReport', async () => {
      const unexpectedError = createMongoError('Database connection lost', {
        code: 'ECONNREFUSED'
      })

      const mockDb = createMockDb({
        createIndex: async () => {},
        insertOne: async () => {
          throw unexpectedError
        }
      })

      const factory = await createReportsRepository(mockDb)
      const repository = factory()

      const params = buildCreateReportParams()

      await expect(repository.createReport(params)).rejects.toThrow(
        'Database connection lost'
      )
    })
  })
})
