import { randomUUID } from 'node:crypto'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { MongoClient } from 'mongodb'
import { describe, expect } from 'vitest'

import { createResubmissionPairsQuery } from './resubmission-pairs-query.mongodb.js'

const DATABASE_NAME = 'epr-backend'
const REPORTS_COLLECTION = 'reports'

const it = /** @type {import('vitest').TestAPI<*>} */ (
  mongoIt.extend({
    mongoClient: async (/** @type {*} */ { db }, use) => {
      const client = await MongoClient.connect(db)
      await use(client)
      await client.close()
    },

    database: async (/** @type {*} */ { mongoClient }, use) => {
      await use(mongoClient.db(DATABASE_NAME))
    },

    reports: async (/** @type {*} */ { database }, use) => {
      const collection = database.collection(REPORTS_COLLECTION)
      await collection.deleteMany({})
      await use(collection)
    },

    query: async (/** @type {*} */ { database }, use) => {
      await use(createResubmissionPairsQuery(database))
    }
  })
)

/**
 * Inserts a minimal submitted-report document. Only the fields the query reads
 * are populated; the figure blocks default to a single-supplier recycling block.
 */
const insertReport = async (collection, overrides = {}) => {
  const {
    organisationId = 'org-1',
    registrationId = 'reg-1',
    year = 2025,
    cadence = 'monthly',
    period = 3,
    submissionNumber = 1,
    currentStatus = REPORT_STATUS.SUBMITTED,
    recyclingActivity = {
      suppliers: [{ supplierName: 'Acme', tonnageReceived: 10 }],
      totalTonnageReceived: 10
    }
  } = overrides

  await collection.insertOne({
    _id: randomUUID(),
    organisationId,
    registrationId,
    year,
    cadence,
    period,
    submissionNumber,
    status: { currentStatus },
    recyclingActivity
  })
}

describe('createResubmissionPairsQuery', () => {
  it('groups a period with two submitted reports, ordered by submissionNumber', async (/** @type {*} */ {
    reports,
    query
  }) => {
    await insertReport(reports, { submissionNumber: 2 })
    await insertReport(reports, { submissionNumber: 1 })

    const { scanned, groups } = await query()

    expect(scanned).toBe(2)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      organisationId: 'org-1',
      registrationId: 'reg-1',
      year: 2025,
      cadence: 'monthly',
      period: 3
    })
    expect(groups[0].submissions.map((s) => s.submissionNumber)).toEqual([1, 2])
  })

  it('excludes a period with only one submitted report', async (/** @type {*} */ {
    reports,
    query
  }) => {
    await insertReport(reports, { submissionNumber: 1 })

    const { scanned, groups } = await query()

    expect(scanned).toBe(1)
    expect(groups).toEqual([])
  })

  it('excludes non-submitted reports from grouping and the scanned count', async (/** @type {*} */ {
    reports,
    query
  }) => {
    await insertReport(reports, { submissionNumber: 1 })
    await insertReport(reports, {
      submissionNumber: 2,
      currentStatus: REPORT_STATUS.IN_PROGRESS
    })

    const { scanned, groups } = await query()

    expect(scanned).toBe(1)
    expect(groups).toEqual([])
  })

  it('keeps distinct periods in separate groups', async (/** @type {*} */ {
    reports,
    query
  }) => {
    await insertReport(reports, { period: 3, submissionNumber: 1 })
    await insertReport(reports, { period: 3, submissionNumber: 2 })
    await insertReport(reports, { period: 4, submissionNumber: 1 })
    await insertReport(reports, { period: 4, submissionNumber: 2 })

    const { groups } = await query()

    expect(groups.map((g) => g.period).sort()).toEqual([3, 4])
  })
})
