import { describe, beforeEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'

import {
  ensureStreamCollection,
  WASTE_BALANCE_EVENTS_COLLECTION_NAME
} from '#waste-balances/repository/stream-mongodb.js'
import {
  buildStreamEvent,
  buildPrnCreatedEvent,
  buildPrnIssuedEvent
} from '#waste-balances/repository/stream-test-data.js'

import { findDuplicateBusinessEvents } from './duplicate-business-events.js'

const DATABASE_NAME = 'epr-backend'

const it = mongoIt.extend({
  mongoClient: async (/** @type {*} */ { db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  streamCollection: async (/** @type {*} */ { mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    await ensureStreamCollection(database)
    await use(database.collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME))
  }
})

describe('findDuplicateBusinessEvents', () => {
  beforeEach(async (/** @type {*} */ { streamCollection }) => {
    await streamCollection.deleteMany({})
  })

  it('flags a PRN business event that appears more than once in a partition', async (/** @type {*} */ {
    streamCollection
  }) => {
    await streamCollection.insertMany([
      buildPrnCreatedEvent({
        number: 1,
        payload: { prnId: 'prn-1', amount: 50 }
      }),
      buildPrnCreatedEvent({
        number: 2,
        payload: { prnId: 'prn-1', amount: 50 }
      })
    ])

    const { prn } = await findDuplicateBusinessEvents(streamCollection)

    expect(prn).toHaveLength(1)
    expect(prn[0]._id).toEqual({
      registrationId: 'reg-1',
      accreditationId: 'acc-1',
      prnId: 'prn-1',
      kind: 'prn-created'
    })
    expect(prn[0].count).toBe(2)
    expect(prn[0].numbers).toEqual([1, 2])
  })

  it('does not flag a single occurrence of a PRN business event', async (/** @type {*} */ {
    streamCollection
  }) => {
    await streamCollection.insertOne(
      buildPrnCreatedEvent({
        number: 1,
        payload: { prnId: 'prn-1', amount: 50 }
      })
    )

    const { prn } = await findDuplicateBusinessEvents(streamCollection)

    expect(prn).toHaveLength(0)
  })

  it('does not conflate different lifecycle kinds for the same PRN', async (/** @type {*} */ {
    streamCollection
  }) => {
    await streamCollection.insertMany([
      buildPrnCreatedEvent({
        number: 1,
        payload: { prnId: 'prn-1', amount: 50 }
      }),
      buildPrnIssuedEvent({
        number: 2,
        payload: { prnId: 'prn-1', amount: 50 }
      })
    ])

    const { prn } = await findDuplicateBusinessEvents(streamCollection)

    expect(prn).toHaveLength(0)
  })

  it('flags a summary-log submission that appears more than once in a partition', async (/** @type {*} */ {
    streamCollection
  }) => {
    await streamCollection.insertMany([
      buildStreamEvent({
        number: 1,
        payload: { summaryLogId: 'log-1', creditTotal: 100 }
      }),
      buildStreamEvent({
        number: 2,
        payload: { summaryLogId: 'log-1', creditTotal: 100 }
      })
    ])

    const { summaryLog } = await findDuplicateBusinessEvents(streamCollection)

    expect(summaryLog).toHaveLength(1)
    expect(summaryLog[0]._id).toEqual({
      registrationId: 'reg-1',
      accreditationId: 'acc-1',
      summaryLogId: 'log-1'
    })
    expect(summaryLog[0].count).toBe(2)
  })

  it('flags duplicate summary-log submissions in a registered-only (null accreditation) partition', async (/** @type {*} */ {
    streamCollection
  }) => {
    await streamCollection.insertMany([
      buildStreamEvent({
        accreditationId: null,
        number: 1,
        payload: { summaryLogId: 'log-1', creditTotal: 100 }
      }),
      buildStreamEvent({
        accreditationId: null,
        number: 2,
        payload: { summaryLogId: 'log-1', creditTotal: 100 }
      })
    ])

    const { summaryLog } = await findDuplicateBusinessEvents(streamCollection)

    expect(summaryLog).toHaveLength(1)
    expect(summaryLog[0]._id.accreditationId).toBeNull()
  })

  it('does not flag the same summary-log id across different partitions', async (/** @type {*} */ {
    streamCollection
  }) => {
    await streamCollection.insertMany([
      buildStreamEvent({
        registrationId: 'reg-1',
        number: 1,
        payload: { summaryLogId: 'log-1', creditTotal: 100 }
      }),
      buildStreamEvent({
        registrationId: 'reg-2',
        number: 1,
        payload: { summaryLogId: 'log-1', creditTotal: 100 }
      })
    ])

    const { summaryLog } = await findDuplicateBusinessEvents(streamCollection)

    expect(summaryLog).toHaveLength(0)
  })

  it('returns no findings for a clean stream', async (/** @type {*} */ {
    streamCollection
  }) => {
    await streamCollection.insertMany([
      buildStreamEvent({
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
      await findDuplicateBusinessEvents(streamCollection)

    expect(prn).toHaveLength(0)
    expect(summaryLog).toHaveLength(0)
  })
})
