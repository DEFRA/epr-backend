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
  year: 2026,
  accreditationId: null,
  accreditationNumber: null,
  ...fields
})

/** @param {Record<string, unknown>} [fields] */
const prn = (fields) => ({
  organisation: { id: 'o1', organisationNumber: '500001' },
  registration: { registrationNumber: 'R1' },
  accreditation: { id: 'acc-1', accreditationNumber: 'A1' },
  ...fields
})

/** @param {Record<string, unknown>} fields */
const ledgerEvent = (fields) => ({ ...NUMBERS, ...fields })

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
    await database.collection('packaging-recycling-notes').insertOne(prn())
    await database
      .collection('waste-balance-events')
      .insertMany([
        ledgerEvent({ accreditationId: 'acc-1', accreditationNumber: 'A1' }),
        ledgerEvent({ accreditationId: null, accreditationNumber: null })
      ])

    expect(await diagnoseNaturalKeyIndexes(database)).toStrictEqual({
      summaryLogs: 2,
      submittingSummaryLogsWithoutNumbers: 0,
      validatedSummaryLogsWithoutNumbers: 0,
      submittingLockClashes: 0,
      reports: 2,
      reportsWithoutNumbers: 0,
      sharedReportNumbers: [],
      prns: 1,
      prnsWithoutNumbers: 0,
      ledgerEvents: 2,
      ledgerEventsWithoutNumbers: 0,
      ledgerSlotClashes: 0
    })
  })

  it('counts ledger slots more than one id partition would take under its numbers', async ({
    database
  }) => {
    await database.collection('waste-balance-events').insertMany([
      ledgerEvent({
        registrationId: 'r1',
        accreditationId: 'acc-1',
        accreditationNumber: 'A1',
        number: 1
      }),
      ledgerEvent({
        registrationId: 'r2',
        accreditationId: 'acc-2',
        accreditationNumber: 'A1',
        number: 1
      }),
      ledgerEvent({
        registrationId: 'r1',
        accreditationId: 'acc-1',
        accreditationNumber: 'A1',
        number: 2
      }),
      ledgerEvent({
        registrationId: 'r1',
        accreditationId: null,
        accreditationNumber: null,
        number: 1
      })
    ])

    const diagnosis = await diagnoseNaturalKeyIndexes(database)

    expect(diagnosis.ledgerSlotClashes).toBe(1)
  })

  it('counts PRNs lacking any of their numbers', async ({ database }) => {
    await database
      .collection('packaging-recycling-notes')
      .insertMany([
        prn(),
        prn({ organisation: { id: 'o1' } }),
        prn({ registration: {} }),
        without('registration', prn()),
        prn({ accreditation: { id: 'acc-1' } })
      ])

    const diagnosis = await diagnoseNaturalKeyIndexes(database)

    expect(diagnosis).toMatchObject({ prns: 5, prnsWithoutNumbers: 4 })
  })

  it('counts ledger events lacking a number their ledger needs', async ({
    database
  }) => {
    await database
      .collection('waste-balance-events')
      .insertMany([
        ledgerEvent({ accreditationId: 'acc-1', accreditationNumber: 'A1' }),
        without(
          'organisationNumber',
          ledgerEvent({ accreditationId: 'acc-1', accreditationNumber: 'A1' })
        ),
        without(
          'registrationNumber',
          ledgerEvent({ accreditationId: 'acc-1', accreditationNumber: 'A1' })
        ),
        ledgerEvent({ accreditationId: 'acc-1', accreditationNumber: null }),
        ledgerEvent({ accreditationId: null })
      ])

    const diagnosis = await diagnoseNaturalKeyIndexes(database)

    expect(diagnosis).toMatchObject({
      ledgerEvents: 5,
      ledgerEventsWithoutNumbers: 4
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

  it('counts a registered-only summary log without its null accreditation number', async ({
    database
  }) => {
    await database
      .collection('summary-logs')
      .insertOne(
        without('accreditationNumber', summaryLog({ status: 'submitting' }))
      )

    const diagnosis = await diagnoseNaturalKeyIndexes(database)

    expect(diagnosis.submittingSummaryLogsWithoutNumbers).toBe(1)
  })

  it('counts submitting summary logs that would share one submitting lock', async ({
    database
  }) => {
    await database
      .collection('summary-logs')
      .insertMany([
        summaryLog({ status: 'submitting', organisationId: 'o1' }),
        summaryLog({ status: 'submitting', organisationId: 'o2' }),
        summaryLog({ status: 'submitting', year: 2025 }),
        summaryLog({ status: 'validated' })
      ])

    const diagnosis = await diagnoseNaturalKeyIndexes(database)

    expect(diagnosis.submittingLockClashes).toBe(1)
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

  it('does not count a report keyed by number alone as another id pair', async ({
    database
  }) => {
    await database
      .collection('reports')
      .insertMany([
        { organisationId: 'o1', registrationId: 'r1', ...NUMBERS },
        { ...NUMBERS }
      ])

    const diagnosis = await diagnoseNaturalKeyIndexes(database)

    expect(diagnosis.sharedReportNumbers).toStrictEqual([])
  })
})
