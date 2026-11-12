import { MongoClient } from 'mongodb'
import { describe, expect, vi } from 'vitest'

import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { ensureLedgerCollection } from '#waste-balances/repository/ledger-mongodb.js'
import { ensureSummaryLogRowStatesCollection } from '#waste-records/repository/mongodb.js'
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

/**
 * A ledger event as stored, `year` absent when it was stored before ledger
 * events recorded their year.
 *
 * @param {object} numbers
 * @param {number} number
 * @param {number} [year]
 */
const event = (numbers, number, year) => ({
  ...numbers,
  ...(year && { year }),
  number,
  kind: 'summary-log-row-received'
})

/**
 * A row state as stored, `year` absent when it was stored before row states
 * recorded their year.
 *
 * @param {object} numbers
 * @param {string} rowId
 * @param {number} [year]
 */
const rowState = (numbers, rowId, year) => ({
  ...numbers,
  ...(year && { year }),
  rowId,
  wasteRecordType: 'received',
  contentHash: `hash-${rowId}`,
  summaryLogIds: ['log-1']
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
      await events.deleteMany({})
      await rowStates.deleteMany({})

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

describe('backfillLedgerYear', () => {
  it('counts what it would place on a dry run, and writes and audits nothing', async ({
    backfill
  }) => {
    await backfill.events.insertMany([
      event(ACCREDITED, 1),
      event(ACCREDITED, 2),
      event(REGISTERED_ONLY, 1)
    ])
    await backfill.rowStates.insertMany([
      rowState(ACCREDITED, '1001'),
      rowState(REGISTERED_ONLY, '2001')
    ])

    const result = await backfill.run(true)

    expect(result).toEqual({
      ledgers: 2,
      events: 3,
      rowStates: 2,
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

  it('places every yearless record in 2026, audits each ledger once, and finds nothing to do the second time', async ({
    backfill
  }) => {
    await backfill.events.insertMany([
      event(ACCREDITED, 1),
      event(ACCREDITED, 2),
      event(REGISTERED_ONLY, 1)
    ])
    await backfill.rowStates.insertMany([
      rowState(ACCREDITED, '1001'),
      rowState(REGISTERED_ONLY, '2001')
    ])

    const first = await backfill.run(false)
    const second = await backfill.run(false)

    expect(first).toEqual({
      ledgers: 2,
      events: 3,
      rowStates: 2,
      failed: 0,
      auditFailed: 0
    })
    expect(second).toMatchObject({ ledgers: 0, events: 0, rowStates: 0 })
    expect(await yearsOf(backfill.events)).toEqual([2026, 2026, 2026])
    expect(await yearsOf(backfill.rowStates)).toEqual([2026, 2026])
    expect(backfill.systemLogsRepository.insert).toHaveBeenCalledTimes(2)
    expect(backfill.systemLogsRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        createdBy: expect.objectContaining({ id: 'system' }),
        event: expect.objectContaining({ action: YEAR_BACKFILL_ACTION }),
        context: { ...ACCREDITED, year: 2026, events: 2, rowStates: 1 }
      })
    )
  })

  it('places a ledger that holds only yearless row states', async ({
    backfill
  }) => {
    await backfill.rowStates.insertOne(rowState(ACCREDITED, '1001'))

    const result = await backfill.run(false)

    expect(result).toMatchObject({ ledgers: 1, events: 0, rowStates: 1 })
    expect(await yearsOf(backfill.rowStates)).toEqual([2026])
  })

  it('places a ledger whose row states for 2026 sit beside yearless ones', async ({
    backfill
  }) => {
    await backfill.events.insertOne(event(ACCREDITED, 1))
    await backfill.rowStates.insertMany([
      rowState(ACCREDITED, '1001'),
      rowState(ACCREDITED, '1002', 2026)
    ])

    const result = await backfill.run(false)

    expect(result).toMatchObject({ ledgers: 1, events: 1, rowStates: 1 })
    expect(await yearsOf(backfill.rowStates)).toEqual([2026, 2026])
  })

  it('leaves records of another year as they are', async ({ backfill }) => {
    await backfill.events.insertMany([
      event(ACCREDITED, 1),
      event(ACCREDITED, 2, 2027)
    ])

    await backfill.run(false)

    expect(await yearsOf(backfill.events)).toEqual([2026, 2027])
  })

  it('places a ledger whose events for 2026 follow yearless ones', async ({
    backfill
  }) => {
    await backfill.events.insertMany([
      event(ACCREDITED, 1),
      event(ACCREDITED, 2, 2026)
    ])

    const result = await backfill.run(false)

    expect(result).toMatchObject({ ledgers: 1, events: 1, rowStates: 0 })
    expect(await yearsOf(backfill.events)).toEqual([2026, 2026])
  })

  it('counts a ledger it fails to write and carries on with the rest', async ({
    backfill
  }) => {
    await backfill.events.insertMany([
      event(ACCREDITED, 1),
      event(REGISTERED_ONLY, 1)
    ])
    const error = new Error('write refused')

    const result = await backfill.run(false, (ledgers) => ({
      ...ledgers,
      assignYear: (numbers, year) =>
        numbers.accreditationNumber === ACCREDITED.accreditationNumber
          ? Promise.reject(error)
          : ledgers.assignYear(numbers, year)
    }))

    expect(result).toMatchObject({ ledgers: 1, events: 1, failed: 1 })
    expect(backfill.logger.error).toHaveBeenCalledWith({
      err: error,
      message:
        'Failed to backfill the year of ledger organisationNumber=500123 registrationNumber=R26SR500123PL accreditationNumber=A26SR500123PL'
    })
  })

  it('counts a ledger written but not audited, keeping the year it wrote', async ({
    backfill
  }) => {
    await backfill.events.insertOne(event(ACCREDITED, 1))
    const error = new Error('audit down')
    vi.mocked(backfill.systemLogsRepository.insert).mockRejectedValue(error)

    const result = await backfill.run(false)

    expect(result).toMatchObject({ ledgers: 1, events: 1, auditFailed: 1 })
    expect(await yearsOf(backfill.events)).toEqual([2026])
    expect(backfill.logger.error).toHaveBeenCalledWith({
      err: error,
      message:
        'Year written but audit failed for ledger organisationNumber=500123 registrationNumber=R26SR500123PL accreditationNumber=A26SR500123PL: events=1 rowStates=0'
    })
  })
})
