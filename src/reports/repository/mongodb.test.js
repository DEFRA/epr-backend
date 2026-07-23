import { beforeEach, describe, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { createReportsRepository } from './mongodb.js'
import { testReportsRepositoryContract } from './port.contract.js'
import { buildCreateReportParams } from '#root/reports/repository/contract/test-data.js'
import { createMockDb } from '#test/mock-db.js'
import { createMongoError } from '#test/mongo-error.js'

/**
 * @import { ReportsRepositoryFactory } from './port.js'
 * @typedef {{ mongoClient: MongoClient, reportsRepository: ReportsRepositoryFactory }} ReportsFixtures
 */

const DATABASE_NAME = 'epr-backend'

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
