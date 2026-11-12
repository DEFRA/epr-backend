import { MongoClient, ObjectId } from 'mongodb'
import { describe, expect, vi } from 'vitest'

import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { ensureLedgerCollection } from '#waste-balances/repository/ledger-mongodb.js'
import { ensureSummaryLogRowStatesCollection } from '#waste-records/repository/mongodb.js'
import { COLLECTION_NAME as SUMMARY_LOGS } from '#repositories/summary-logs/mongodb.js'
import { COLLECTION_NAME as PRNS } from '#packaging-recycling-notes/repository/mongodb.js'
import { createMockSystemLogsRepository } from '#test/mock-repositories.js'
import { createMockLogger } from '#test/mock-logger.js'

import { createYearlessLedgers } from '../mongodb.js'
import { backfillLedgerYear, YEAR_BACKFILL_ACTION } from './backfill.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */
/** @import { YearlessLedgers } from '../mongodb.js' */

const ACCREDITED = {
  organisationNumber: '500123',
  registrationNumber: 'R26SR500123PL',
  accreditationNumber: 'A26SR500123PL'
}

const REGISTERED_ONLY = {
  organisationNumber: '500124',
  registrationNumber: 'R26SR500124PL',
  accreditationNumber: null
}

const LOG_2026 = 'file-2026'
const LOG_2027 = 'file-2027'
const LOG_WITHOUT_YEAR = 'file-without-year'
const PRN_2027 = new ObjectId().toHexString()

/**
 * A ledger event as stored, `year` absent when it was stored before ledger
 * events recorded their year.
 *
 * @param {object} numbers
 * @param {number} number
 * @param {{ summaryLogId: string } | { prnId: string }} source
 * @param {number} [year]
 */
const event = (numbers, number, source, year) => ({
  ...numbers,
  ...(year && { year }),
  number,
  kind: 'prnId' in source ? 'prn-created' : 'summary-log-submitted',
  payload: source
})

/**
 * A row state as stored, `year` absent when it was stored before row states
 * recorded their year.
 *
 * @param {object} numbers
 * @param {string} rowId
 * @param {string[]} summaryLogIds
 * @param {number} [year]
 */
const rowState = (numbers, rowId, summaryLogIds, year) => ({
  ...numbers,
  ...(year && { year }),
  rowId,
  wasteRecordType: 'received',
  contentHash: `hash-${rowId}`,
  summaryLogIds
})

/**
 * @typedef {Object} Backfill
 * @property {import('mongodb').Collection<any>} events
 * @property {import('mongodb').Collection<any>} rowStates
 * @property {SystemLogsRepository} systemLogsRepository
 * @property {TypedLogger} logger
 * @property {(isDryRun: boolean, wrap?: (ledgers: YearlessLedgers) => YearlessLedgers) => ReturnType<typeof backfillLedgerYear>} run
 */

const it = /** @type {import('vitest').TestAPI<{ backfill: Backfill }>} */ (
  mongoIt.extend({
    backfill: async (/** @type {*} */ { db }, use) => {
      const client = await MongoClient.connect(db)
      const database = client.db('epr-backend')
      const events = await ensureLedgerCollection(database)
      const rowStates = await ensureSummaryLogRowStatesCollection(database)
      const summaryLogs = database.collection(SUMMARY_LOGS)
      const prns = database.collection(PRNS)
      await Promise.all(
        [events, rowStates, summaryLogs, prns].map((c) => c.deleteMany({}))
      )
      await summaryLogs.insertMany([
        { file: { id: LOG_2026 }, year: 2026 },
        { file: { id: LOG_2027 }, year: 2027 },
        { file: { id: LOG_WITHOUT_YEAR } }
      ])
      await prns.insertOne({
        _id: ObjectId.createFromHexString(PRN_2027),
        accreditation: { accreditationYear: 2027 }
      })

      const logger = createMockLogger()
      const systemLogsRepository = createMockSystemLogsRepository()

      /** @type {Backfill} */
      const backfill = {
        events,
        rowStates,
        systemLogsRepository,
        logger,
        run: (isDryRun, wrap = (ledgers) => ledgers) =>
          backfillLedgerYear(
            {
              ledgers: wrap(createYearlessLedgers(database)),
              systemLogsRepository,
              logger
            },
            { isDryRun }
          )
      }

      await use(backfill)
      await client.close()
    }
  })
)

const yearsOf = async (/** @type {import('mongodb').Collection<any>} */ c) =>
  (await c.find({}, { sort: { _id: 1 } }).toArray()).map((doc) => doc.year)

/** @param {Backfill} backfill */
const storeMixedYears = async (backfill) => {
  await backfill.events.insertMany([
    event(ACCREDITED, 1, { summaryLogId: LOG_2026 }),
    event(ACCREDITED, 2, { prnId: PRN_2027 }),
    event(REGISTERED_ONLY, 1, { summaryLogId: LOG_WITHOUT_YEAR }),
    event(REGISTERED_ONLY, 2, { summaryLogId: LOG_2027 })
  ])
  await backfill.rowStates.insertMany([
    rowState(ACCREDITED, '1001', [LOG_2026, LOG_WITHOUT_YEAR]),
    rowState(REGISTERED_ONLY, '2001', [LOG_2027])
  ])
}

const NOTHING_SKIPPED = { events: 0, rowStates: 0 }

describe('backfillLedgerYear', () => {
  it('counts by year what it would place on a dry run, and writes and audits nothing', async ({
    backfill
  }) => {
    await storeMixedYears(backfill)

    const result = await backfill.run(true)

    expect(result).toEqual({
      ledgers: 4,
      years: new Map([
        [2026, { events: 2, rowStates: 1 }],
        [2027, { events: 2, rowStates: 1 }]
      ]),
      skipped: NOTHING_SKIPPED,
      failed: 0,
      auditFailed: 0
    })
    expect(
      await backfill.events.countDocuments({ year: { $exists: true } })
    ).toBe(0)
    expect(
      await backfill.rowStates.countDocuments({ year: { $exists: true } })
    ).toBe(0)
    expect(backfill.systemLogsRepository.insert).not.toHaveBeenCalled()
  })

  it('gives each record the year of its summary log or PRN, audits each ledger and year once, and finds nothing to do the second time', async ({
    backfill
  }) => {
    await storeMixedYears(backfill)

    const first = await backfill.run(false)
    const second = await backfill.run(false)

    expect(first).toMatchObject({ ledgers: 4, failed: 0, auditFailed: 0 })
    expect(second).toEqual({
      ledgers: 0,
      years: new Map(),
      skipped: NOTHING_SKIPPED,
      failed: 0,
      auditFailed: 0
    })
    expect(await yearsOf(backfill.events)).toEqual([2026, 2027, 2026, 2027])
    expect(await yearsOf(backfill.rowStates)).toEqual([2026, 2027])
    expect(backfill.systemLogsRepository.insert).toHaveBeenCalledTimes(4)
    expect(backfill.systemLogsRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        createdBy: expect.objectContaining({ id: 'system' }),
        event: expect.objectContaining({ action: YEAR_BACKFILL_ACTION }),
        context: { ...ACCREDITED, year: 2027, events: 1, rowStates: 0 }
      })
    )
  })

  it('skips a row state whose summary logs give different years, and places the rest of its ledger', async ({
    backfill
  }) => {
    await backfill.events.insertOne(
      event(ACCREDITED, 1, { summaryLogId: LOG_2026 })
    )
    await backfill.rowStates.insertOne(
      rowState(ACCREDITED, '1001', [LOG_2026, LOG_2027])
    )

    const result = await backfill.run(false)

    expect(result).toMatchObject({
      ledgers: 1,
      years: new Map([[2026, { events: 1, rowStates: 0 }]]),
      skipped: { events: 0, rowStates: 1 }
    })
    expect(await yearsOf(backfill.rowStates)).toEqual([undefined])
    expect(backfill.logger.error).not.toHaveBeenCalled()
  })

  it('skips a record whose summary log or PRN is not found', async ({
    backfill
  }) => {
    await backfill.events.insertMany([
      event(ACCREDITED, 1, { summaryLogId: 'file-gone' }),
      event(ACCREDITED, 2, { prnId: new ObjectId().toHexString() })
    ])
    await backfill.rowStates.insertOne(
      rowState(ACCREDITED, '1001', ['file-gone'])
    )

    const result = await backfill.run(false)

    expect(result).toMatchObject({
      ledgers: 0,
      skipped: { events: 2, rowStates: 1 }
    })
    expect(await yearsOf(backfill.events)).toEqual([undefined, undefined])
  })

  it('leaves records that hold a year as they are', async ({ backfill }) => {
    await backfill.events.insertMany([
      event(ACCREDITED, 1, { summaryLogId: LOG_2026 }),
      event(ACCREDITED, 2, { summaryLogId: LOG_2027 }, 2026)
    ])

    await backfill.run(false)

    expect(await yearsOf(backfill.events)).toEqual([2026, 2026])
  })

  it('neither counts nor audits records that another run placed first', async ({
    backfill
  }) => {
    await backfill.events.insertOne(
      event(ACCREDITED, 1, { summaryLogId: LOG_2026 })
    )

    const result = await backfill.run(false, (ledgers) => ({
      ...ledgers,
      assignYear: async (ids, year) => {
        await ledgers.assignYear(ids, year)
        return ledgers.assignYear(ids, year)
      }
    }))

    expect(result).toMatchObject({ ledgers: 0, years: new Map() })
    expect(backfill.systemLogsRepository.insert).not.toHaveBeenCalled()
  })

  it('counts a ledger it fails to write and carries on with the rest', async ({
    backfill
  }) => {
    await backfill.events.insertMany([
      event(ACCREDITED, 1, { summaryLogId: LOG_2026 }),
      event(REGISTERED_ONLY, 1, { summaryLogId: LOG_2026 })
    ])
    const error = new Error('read refused')

    const result = await backfill.run(false, (ledgers) => ({
      ...ledgers,
      readYearless: (numbers) =>
        numbers.accreditationNumber === ACCREDITED.accreditationNumber
          ? Promise.reject(error)
          : ledgers.readYearless(numbers)
    }))

    expect(result).toMatchObject({ ledgers: 1, failed: 1 })
    expect(backfill.logger.error).toHaveBeenCalledWith({
      err: error,
      message:
        'Failed to backfill the year of ledger organisationNumber=500123 registrationNumber=R26SR500123PL accreditationNumber=A26SR500123PL'
    })
  })

  it('counts a ledger written but not audited, keeping the year it wrote', async ({
    backfill
  }) => {
    await backfill.events.insertOne(
      event(ACCREDITED, 1, { summaryLogId: LOG_2026 })
    )
    const error = new Error('audit down')
    vi.mocked(backfill.systemLogsRepository.insert).mockRejectedValue(error)

    const result = await backfill.run(false)

    expect(result).toMatchObject({ ledgers: 1, auditFailed: 1 })
    expect(await yearsOf(backfill.events)).toEqual([2026])
    expect(backfill.logger.error).toHaveBeenCalledWith({
      err: error,
      message:
        'Year written but audit failed for ledger organisationNumber=500123 registrationNumber=R26SR500123PL accreditationNumber=A26SR500123PL year=2026: events=1 rowStates=0'
    })
  })
})
