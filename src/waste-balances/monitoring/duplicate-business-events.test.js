import { describe, beforeEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'

import {
  ensureLedgerCollection,
  WASTE_BALANCE_EVENTS_COLLECTION_NAME
} from '#waste-balances/repository/ledger-mongodb.js'
import {
  buildLedgerEvent,
  buildPrnCreatedEvent,
  buildPrnIssuedEvent
} from '#waste-balances/repository/ledger-test-data.js'

import { findDuplicateBusinessEvents } from './duplicate-business-events.js'

const DATABASE_NAME = 'epr-backend'

const it = mongoIt.extend({
  mongoClient: async (/** @type {*} */ { db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  ledgerCollection: async (/** @type {*} */ { mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    await ensureLedgerCollection(database)
    await use(database.collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME))
  }
})

describe('findDuplicateBusinessEvents', () => {
  beforeEach(async (/** @type {*} */ { ledgerCollection }) => {
    await ledgerCollection.deleteMany({})
  })

  it('flags a PRN business event that appears more than once in a ledger', async (/** @type {*} */ {
    ledgerCollection
  }) => {
    await ledgerCollection.insertMany([
      buildPrnCreatedEvent({
        number: 1,
        payload: { prnId: 'prn-1', amount: 50 }
      }),
      buildPrnCreatedEvent({
        number: 2,
        payload: { prnId: 'prn-1', amount: 50 }
      })
    ])

    const { prn } = await findDuplicateBusinessEvents(ledgerCollection)

    expect(prn.map((group) => group._id)).toEqual([
      {
        registrationId: 'reg-1',
        accreditationId: 'acc-1',
        prnId: 'prn-1',
        kind: 'prn-created'
      }
    ])
    expect(prn).toMatchObject([
      {
        count: 2,
        entries: [{ number: 1 }, { number: 2 }],
        organisationIds: ['org-1']
      }
    ])
  })

  it('flags a cancellation credited twice — the double credit this exists to find', async (/** @type {*} */ {
    ledgerCollection
  }) => {
    await ledgerCollection.insertMany([
      buildLedgerEvent({
        kind: 'prn-cancelled-after-issue',
        number: 4,
        payload: { prnId: 'prn-1', amount: 50 }
      }),
      buildLedgerEvent({
        kind: 'prn-cancelled-after-issue',
        number: 5,
        payload: { prnId: 'prn-1', amount: 50 }
      })
    ])

    const { prn } = await findDuplicateBusinessEvents(ledgerCollection)

    expect(prn).toMatchObject([
      {
        _id: { kind: 'prn-cancelled-after-issue' },
        entries: [{ number: 4 }, { number: 5 }]
      }
    ])
  })

  it('pairs each slot with its own write time, even when a stored event has none', async (/** @type {*} */ {
    ledgerCollection
  }) => {
    const duplicated = { prnId: 'prn-1', amount: 50 }
    const { createdAt: _omittedCreatedAt, ...withoutCreatedAt } =
      buildPrnCreatedEvent({ number: 2, payload: duplicated })
    await ledgerCollection.insertMany([
      buildPrnCreatedEvent({
        number: 1,
        createdAt: new Date('2026-01-15T10:00:01.000Z'),
        payload: duplicated
      }),
      withoutCreatedAt,
      buildPrnCreatedEvent({
        number: 3,
        createdAt: new Date('2026-01-15T10:00:03.000Z'),
        payload: duplicated
      })
    ])

    const { prn } = await findDuplicateBusinessEvents(ledgerCollection)

    expect(prn.map((group) => group.entries)).toEqual([
      [
        { number: 1, createdAt: new Date('2026-01-15T10:00:01.000Z') },
        { number: 2 },
        { number: 3, createdAt: new Date('2026-01-15T10:00:03.000Z') }
      ]
    ])
    expect(prn).toMatchObject([{ count: 3 }])
  })

  it('reports every organisation a repeated identity was written under', async (/** @type {*} */ {
    ledgerCollection
  }) => {
    await ledgerCollection.insertMany([
      buildPrnCreatedEvent({
        organisationId: 'org-2',
        number: 1,
        payload: { prnId: 'prn-1', amount: 50 }
      }),
      buildPrnCreatedEvent({
        organisationId: 'org-1',
        number: 2,
        payload: { prnId: 'prn-1', amount: 50 }
      })
    ])

    const { prn } = await findDuplicateBusinessEvents(ledgerCollection)

    expect(prn).toMatchObject([{ organisationIds: ['org-1', 'org-2'] }])
  })

  it('does not flag a single occurrence of a PRN business event', async (/** @type {*} */ {
    ledgerCollection
  }) => {
    await ledgerCollection.insertOne(
      buildPrnCreatedEvent({
        number: 1,
        payload: { prnId: 'prn-1', amount: 50 }
      })
    )

    const { prn } = await findDuplicateBusinessEvents(ledgerCollection)

    expect(prn).toHaveLength(0)
  })

  it('does not conflate different lifecycle kinds for the same PRN', async (/** @type {*} */ {
    ledgerCollection
  }) => {
    await ledgerCollection.insertMany([
      buildPrnCreatedEvent({
        number: 1,
        payload: { prnId: 'prn-1', amount: 50 }
      }),
      buildPrnIssuedEvent({
        number: 2,
        payload: { prnId: 'prn-1', amount: 50 }
      })
    ])

    const { prn } = await findDuplicateBusinessEvents(ledgerCollection)

    expect(prn).toHaveLength(0)
  })

  it('does not flag the same PRN event kind across different ledgers', async (/** @type {*} */ {
    ledgerCollection
  }) => {
    await ledgerCollection.insertMany([
      buildPrnCreatedEvent({
        registrationId: 'reg-1',
        number: 1,
        payload: { prnId: 'prn-1', amount: 50 }
      }),
      buildPrnCreatedEvent({
        registrationId: 'reg-2',
        number: 1,
        payload: { prnId: 'prn-1', amount: 50 }
      })
    ])

    const { prn } = await findDuplicateBusinessEvents(ledgerCollection)

    expect(prn).toHaveLength(0)
  })

  it('sorts findings by descending count so the worst duplication surfaces first', async (/** @type {*} */ {
    ledgerCollection
  }) => {
    await ledgerCollection.insertMany([
      buildPrnCreatedEvent({
        number: 1,
        payload: { prnId: 'prn-twice', amount: 50 }
      }),
      buildPrnCreatedEvent({
        number: 2,
        payload: { prnId: 'prn-twice', amount: 50 }
      }),
      buildPrnCreatedEvent({
        number: 3,
        payload: { prnId: 'prn-thrice', amount: 50 }
      }),
      buildPrnCreatedEvent({
        number: 4,
        payload: { prnId: 'prn-thrice', amount: 50 }
      }),
      buildPrnCreatedEvent({
        number: 5,
        payload: { prnId: 'prn-thrice', amount: 50 }
      })
    ])

    const { prn } = await findDuplicateBusinessEvents(ledgerCollection)

    expect(prn.map((group) => [group._id.prnId, group.count])).toEqual([
      ['prn-thrice', 3],
      ['prn-twice', 2]
    ])
  })

  it('flags a summary-log submission that appears more than once in a ledger', async (/** @type {*} */ {
    ledgerCollection
  }) => {
    await ledgerCollection.insertMany([
      buildLedgerEvent({
        number: 1,
        payload: { summaryLogId: 'log-1', creditTotal: 100 }
      }),
      buildLedgerEvent({
        number: 2,
        payload: { summaryLogId: 'log-1', creditTotal: 100 }
      })
    ])

    const { summaryLog } = await findDuplicateBusinessEvents(ledgerCollection)

    expect(summaryLog.map((group) => group._id)).toEqual([
      {
        registrationId: 'reg-1',
        accreditationId: 'acc-1',
        summaryLogId: 'log-1'
      }
    ])
    expect(summaryLog).toMatchObject([{ count: 2, organisationIds: ['org-1'] }])
  })

  it('flags duplicate summary-log submissions in a registered-only (null accreditation) ledger', async (/** @type {*} */ {
    ledgerCollection
  }) => {
    await ledgerCollection.insertMany([
      buildLedgerEvent({
        accreditationId: null,
        number: 1,
        payload: { summaryLogId: 'log-1', creditTotal: 100 }
      }),
      buildLedgerEvent({
        accreditationId: null,
        number: 2,
        payload: { summaryLogId: 'log-1', creditTotal: 100 }
      })
    ])

    const { summaryLog } = await findDuplicateBusinessEvents(ledgerCollection)

    expect(summaryLog).toMatchObject([{ _id: { accreditationId: null } }])
  })

  it('does not flag the same summary-log id across different ledgers', async (/** @type {*} */ {
    ledgerCollection
  }) => {
    await ledgerCollection.insertMany([
      buildLedgerEvent({
        registrationId: 'reg-1',
        number: 1,
        payload: { summaryLogId: 'log-1', creditTotal: 100 }
      }),
      buildLedgerEvent({
        registrationId: 'reg-2',
        number: 1,
        payload: { summaryLogId: 'log-1', creditTotal: 100 }
      })
    ])

    const { summaryLog } = await findDuplicateBusinessEvents(ledgerCollection)

    expect(summaryLog).toHaveLength(0)
  })

  it('returns no findings for a clean ledger', async (/** @type {*} */ {
    ledgerCollection
  }) => {
    await ledgerCollection.insertMany([
      buildLedgerEvent({
        number: 1,
        payload: { summaryLogId: 'log-1', creditTotal: 100 }
      }),
      buildPrnCreatedEvent({
        number: 2,
        payload: { prnId: 'prn-1', amount: 50 }
      }),
      buildPrnIssuedEvent({
        number: 3,
        payload: { prnId: 'prn-1', amount: 50 }
      })
    ])

    const { prn, summaryLog } =
      await findDuplicateBusinessEvents(ledgerCollection)

    expect(prn).toHaveLength(0)
    expect(summaryLog).toHaveLength(0)
  })
})
