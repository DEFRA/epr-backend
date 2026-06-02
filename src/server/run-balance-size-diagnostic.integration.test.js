import { describe, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { findTopWasteBalancesBySize } from './run-balance-size-diagnostic.js'

const DATABASE_NAME = 'epr-backend'
const COLLECTION_NAME = 'waste-balances'

/** @typedef {{ database: import('mongodb').Db }} DatabaseContext */

const it = mongoIt.extend({
  database: async (/** @type {{ db: string }} */ { db: uri }, use) => {
    const client = await MongoClient.connect(uri)
    const database = client.db(DATABASE_NAME)
    await database.collection(COLLECTION_NAME).deleteMany({})
    await use(database)
    await client.close()
  }
})

const transaction = (id) => ({
  id,
  type: 'credit',
  createdAt: '2026-05-14T00:00:00.000Z',
  createdBy: { id: 'user-1', name: 'user-1' },
  amount: 1,
  openingAmount: 0,
  closingAmount: 1,
  openingAvailableAmount: 0,
  closingAvailableAmount: 1,
  entities: [
    {
      id: 'wr-1',
      currentVersionId: 'wr-1',
      previousVersionIds: [],
      type: 'waste_record:received'
    }
  ]
})

const balance = ({
  id,
  accreditationId,
  organisationId = 'org-1',
  transactionCount = 0,
  canonicalSource = 'embedded'
}) => ({
  _id: id,
  accreditationId,
  organisationId,
  amount: 0,
  availableAmount: 0,
  schemaVersion: 1,
  version: 1,
  canonicalSource,
  transactions: Array.from({ length: transactionCount }, (_, i) =>
    transaction(`${accreditationId}-txn-${i}`)
  )
})

describe('findTopWasteBalancesBySize (integration)', () => {
  it('returns empty when no balances exist', async (/** @type {DatabaseContext} */ {
    database
  }) => {
    expect(await findTopWasteBalancesBySize(database)).toEqual([])
  })

  it('orders results by descending bsonSize and returns transactionCount alongside', async (/** @type {DatabaseContext} */ {
    database
  }) => {
    await database.collection(COLLECTION_NAME).insertMany([
      balance({
        id: 'bal-small',
        accreditationId: 'acc-small',
        transactionCount: 1
      }),
      balance({
        id: 'bal-big',
        accreditationId: 'acc-big',
        transactionCount: 50
      }),
      balance({
        id: 'bal-medium',
        accreditationId: 'acc-medium',
        transactionCount: 10
      })
    ])

    const rows = await findTopWasteBalancesBySize(database)

    expect(rows.map((r) => r.accreditationId)).toEqual([
      'acc-big',
      'acc-medium',
      'acc-small'
    ])
    expect(rows.map((r) => r.transactionCount)).toEqual([50, 10, 1])
    expect(rows[0].bsonSize).toBeGreaterThan(rows[1].bsonSize)
    expect(rows[1].bsonSize).toBeGreaterThan(rows[2].bsonSize)
  })

  it('excludes ledger-canonical balances from the snapshot', async (/** @type {DatabaseContext} */ {
    database
  }) => {
    await database.collection(COLLECTION_NAME).insertMany([
      balance({
        id: 'bal-emb',
        accreditationId: 'acc-emb',
        transactionCount: 5,
        canonicalSource: 'embedded'
      }),
      balance({
        id: 'bal-mig',
        accreditationId: 'acc-mig',
        transactionCount: 5,
        canonicalSource: 'migrating'
      }),
      balance({
        id: 'bal-ledger',
        accreditationId: 'acc-ledger',
        transactionCount: 100,
        canonicalSource: 'ledger'
      })
    ])

    const rows = await findTopWasteBalancesBySize(database)

    expect(rows.map((r) => r.accreditationId).sort()).toEqual([
      'acc-emb',
      'acc-mig'
    ])
  })

  it('caps results at 10 even when more embedded balances exist', async (/** @type {DatabaseContext} */ {
    database
  }) => {
    const docs = Array.from({ length: 15 }, (_, i) =>
      balance({
        id: `bal-${i}`,
        accreditationId: `acc-${i}`,
        transactionCount: 15 - i
      })
    )
    await database.collection(COLLECTION_NAME).insertMany(docs)

    const rows = await findTopWasteBalancesBySize(database)

    expect(rows).toHaveLength(10)
  })
})
