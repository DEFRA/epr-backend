import { describe, beforeEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { findRowIdCollisions } from './run-row-id-collision-diagnostic.js'

const DATABASE_NAME = 'epr-backend'
const COLLECTION_NAME = 'waste-records'

const it = mongoIt.extend({
  db: async ({ db: uri }, use) => {
    const client = await MongoClient.connect(uri)
    const database = client.db(DATABASE_NAME)
    await use(database)
    await client.close()
  }
})

const wasteRecord = (overrides = {}) => ({
  organisationId: overrides.organisationId || 'org-A',
  registrationId: overrides.registrationId || 'reg-1',
  type: overrides.type || 'received',
  rowId: overrides.rowId || 'row-1',
  data: { GROSS_WEIGHT: 10 },
  versions: [
    {
      id: `v-${overrides.organisationId || 'org-A'}-${overrides.type || 'received'}-${overrides.rowId || 'row-1'}`,
      createdAt: '2026-04-01T00:00:00.000Z',
      status: 'created',
      summaryLog: { id: 'sl-1', uri: 's3://bucket/key' },
      data: { GROSS_WEIGHT: 10 }
    }
  ]
})

describe('findRowIdCollisions (integration)', () => {
  beforeEach(async ({ db }) => {
    await db.collection(COLLECTION_NAME).deleteMany({})
  })

  it('returns empty when no records exist', async ({ db }) => {
    expect(await findRowIdCollisions(db)).toEqual([])
  })

  it('returns empty when every rowId has a single type', async ({ db }) => {
    await db.collection(COLLECTION_NAME).insertMany([
      wasteRecord({ rowId: 'row-1', type: 'received' }),
      wasteRecord({ rowId: 'row-2', type: 'received' }),
      wasteRecord({
        registrationId: 'reg-2',
        rowId: 'row-1',
        type: 'processed'
      })
    ])

    expect(await findRowIdCollisions(db)).toEqual([])
  })

  it('flags a registration where one rowId appears under two types', async ({
    db
  }) => {
    await db
      .collection(COLLECTION_NAME)
      .insertMany([
        wasteRecord({ rowId: 'row-42', type: 'received' }),
        wasteRecord({ rowId: 'row-42', type: 'processed' })
      ])

    expect(await findRowIdCollisions(db)).toEqual([
      {
        _id: { organisationId: 'org-A', registrationId: 'reg-1' },
        collidingRowIds: 1,
        collidingRecordCount: 2
      }
    ])
  })

  it('counts every doc involved in each collision across all rowIds', async ({
    db
  }) => {
    await db.collection(COLLECTION_NAME).insertMany([
      // rowId 1 → 2 types = 2 docs
      wasteRecord({ rowId: 'row-1', type: 'received' }),
      wasteRecord({ rowId: 'row-1', type: 'processed' }),
      // rowId 2 → 3 types = 3 docs
      wasteRecord({ rowId: 'row-2', type: 'received' }),
      wasteRecord({ rowId: 'row-2', type: 'processed' }),
      wasteRecord({ rowId: 'row-2', type: 'sentOn' }),
      // rowId 3 → single type, ignored
      wasteRecord({ rowId: 'row-3', type: 'received' })
    ])

    expect(await findRowIdCollisions(db)).toEqual([
      {
        _id: { organisationId: 'org-A', registrationId: 'reg-1' },
        collidingRowIds: 2,
        collidingRecordCount: 5
      }
    ])
  })

  it('keeps collisions in different registrations separate', async ({ db }) => {
    await db.collection(COLLECTION_NAME).insertMany([
      wasteRecord({
        organisationId: 'org-A',
        registrationId: 'reg-1',
        rowId: 'row-1',
        type: 'received'
      }),
      wasteRecord({
        organisationId: 'org-A',
        registrationId: 'reg-1',
        rowId: 'row-1',
        type: 'processed'
      }),
      wasteRecord({
        organisationId: 'org-B',
        registrationId: 'reg-9',
        rowId: 'row-1',
        type: 'received'
      }),
      wasteRecord({
        organisationId: 'org-B',
        registrationId: 'reg-9',
        rowId: 'row-1',
        type: 'exported'
      })
    ])

    expect(await findRowIdCollisions(db)).toEqual([
      {
        _id: { organisationId: 'org-A', registrationId: 'reg-1' },
        collidingRowIds: 1,
        collidingRecordCount: 2
      },
      {
        _id: { organisationId: 'org-B', registrationId: 'reg-9' },
        collidingRowIds: 1,
        collidingRecordCount: 2
      }
    ])
  })

  it('does not conflate rowId collisions across registrations within the same organisation', async ({
    db
  }) => {
    await db.collection(COLLECTION_NAME).insertMany([
      wasteRecord({
        registrationId: 'reg-1',
        rowId: 'row-1',
        type: 'received'
      }),
      wasteRecord({
        registrationId: 'reg-2',
        rowId: 'row-1',
        type: 'processed'
      })
    ])

    expect(await findRowIdCollisions(db)).toEqual([])
  })
})
