import { MongoClient } from 'mongodb'
import { randomUUID } from 'node:crypto'

import { it as mongoIt } from '#vite/fixtures/mongo.js'

import { diagnoseNaturalKeyIndexes } from './diagnose-natural-key-indexes.js'

/** @import { Db } from 'mongodb' */

const it = /** @type {import('vitest').TestAPI<{ database: Db }>} */ (
  mongoIt.extend({
    database: async (/** @type {{ db: string }} */ { db }, use) => {
      const client = await MongoClient.connect(db)
      const database = client.db(`natural-key-index-${randomUUID()}`)
      await use(database)
      await database.dropDatabase()
      await client.close()
    }
  })
)

const NUMBERS = { organisationNumber: '500001', registrationNumber: 'R1' }

/** @param {Record<string, unknown>} fields */
const summaryLog = (fields) => ({
  ...NUMBERS,
  accreditationId: null,
  ...fields
})

/**
 * A document with `field` absent, as one stored before it was written.
 *
 * @param {string} field
 * @param {Record<string, unknown>} document
 */
const without = (field, { [field]: _absent, ...rest }) => rest

describe('diagnoseNaturalKeyIndexes', () => {
  it('finds nothing in the way of the indexes when every document holds its numbers', async ({
    database
  }) => {
    await database
      .collection('summary-logs')
      .insertMany([
        summaryLog({ status: 'submitting' }),
        summaryLog({ status: 'validated' })
      ])
    await database.collection('reports').insertMany([
      { organisationId: 'o1', registrationId: 'r1', ...NUMBERS },
      { organisationId: 'o1', registrationId: 'r1', ...NUMBERS }
    ])
    expect(await diagnoseNaturalKeyIndexes(database)).toStrictEqual({
      summaryLogs: 2,
      submittingSummaryLogsWithoutNumbers: 0,
      validatedSummaryLogsWithoutNumbers: 0,
      reports: 2,
      reportsWithoutNumbers: 0,
      sharedReportNumbers: []
    })
  })

  it('counts submitting and validated summary logs lacking a number, by status', async ({
    database
  }) => {
    await database
      .collection('summary-logs')
      .insertMany([
        without('organisationNumber', summaryLog({ status: 'submitting' })),
        without('registrationNumber', summaryLog({ status: 'submitting' })),
        without('registrationNumber', summaryLog({ status: 'validated' })),
        without('organisationNumber', summaryLog({ status: 'submitted' }))
      ])

    const diagnosis = await diagnoseNaturalKeyIndexes(database)

    expect(diagnosis).toMatchObject({
      submittingSummaryLogsWithoutNumbers: 2,
      validatedSummaryLogsWithoutNumbers: 1
    })
  })

  it('counts an accredited summary log without its accreditation number', async ({
    database
  }) => {
    await database
      .collection('summary-logs')
      .insertOne({ status: 'submitting', accreditationId: 'acc-1', ...NUMBERS })

    const diagnosis = await diagnoseNaturalKeyIndexes(database)

    expect(diagnosis.submittingSummaryLogsWithoutNumbers).toBe(1)
  })

  it('counts reports lacking a number, and names numbers shared by more than one id pair', async ({
    database
  }) => {
    await database.collection('reports').insertMany([
      { organisationId: 'o1', registrationId: 'r1', ...NUMBERS },
      { organisationId: 'o2', registrationId: 'r2', ...NUMBERS },
      { organisationId: 'o3', registrationId: 'r3', organisationNumber: '7' }
    ])

    const diagnosis = await diagnoseNaturalKeyIndexes(database)

    expect(diagnosis.reportsWithoutNumbers).toBe(1)
    expect(diagnosis.sharedReportNumbers).toStrictEqual([
      {
        ...NUMBERS,
        idPairs: expect.arrayContaining([
          { organisationId: 'o1', registrationId: 'r1' },
          { organisationId: 'o2', registrationId: 'r2' }
        ])
      }
    ])
  })
})
