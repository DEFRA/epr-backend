import { describe, beforeEach } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { createWasteRecordsRepository } from './mongodb.js'
import { testWasteRecordsRepositoryContract } from './port.contract.js'
import {
  WASTE_RECORD_TYPE,
  VERSION_STATUS
} from '#domain/waste-records/model.js'
import {
  buildVersionData,
  toWasteRecordVersions
} from './contract/test-data.js'

const DATABASE_NAME = 'epr-backend'
const COLLECTION_NAME = 'waste-records'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  wasteRecordsRepository: async ({ mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    const factory = await createWasteRecordsRepository(database)
    await use(factory)
  }
})

describe('MongoDB waste records repository', () => {
  beforeEach(async ({ mongoClient }) => {
    await mongoClient
      .db(DATABASE_NAME)
      .collection(COLLECTION_NAME)
      .deleteMany({})
  })

  describe('waste records repository contract', () => {
    testWasteRecordsRepositoryContract(it)
  })

  it('stores tonnage/weight fields as Decimal128 in MongoDB without rounding', async ({
    mongoClient,
    wasteRecordsRepository
  }) => {
    const repository = await wasteRecordsRepository()

    const sourcePrecisionWeight = 123.456789
    const sourcePrecisionTonnage = 100.105

    const initial = toWasteRecordVersions({
      [WASTE_RECORD_TYPE.RECEIVED]: {
        'row-decimal128': buildVersionData({
          summaryLogId: 'log-decimal128-1',
          summaryLogUri: 's3://bucket/decimal128-1',
          versionData: {
            GROSS_WEIGHT: sourcePrecisionWeight,
            NOTE: 'initial'
          },
          currentData: {
            GROSS_WEIGHT: sourcePrecisionWeight,
            NOTE: 'initial'
          }
        })
      }
    })

    await repository.appendVersions('org-1', 'reg-1', initial)

    const updated = toWasteRecordVersions({
      [WASTE_RECORD_TYPE.RECEIVED]: {
        'row-decimal128': buildVersionData({
          createdAt: '2025-01-20T10:00:00.000Z',
          status: VERSION_STATUS.UPDATED,
          summaryLogId: 'log-decimal128-2',
          summaryLogUri: 's3://bucket/decimal128-2',
          versionData: {
            PRODUCT_TONNAGE: sourcePrecisionTonnage,
            NOTE: 'updated'
          },
          currentData: {
            GROSS_WEIGHT: sourcePrecisionWeight,
            PRODUCT_TONNAGE: sourcePrecisionTonnage,
            NOTE: 'updated'
          }
        })
      }
    })

    await repository.appendVersions('org-1', 'reg-1', updated)

    const raw = await mongoClient
      .db(DATABASE_NAME)
      .collection(COLLECTION_NAME)
      .findOne({
        organisationId: 'org-1',
        registrationId: 'reg-1',
        type: WASTE_RECORD_TYPE.RECEIVED,
        rowId: 'row-decimal128'
      })

    expect(raw.data.GROSS_WEIGHT?._bsontype).toBe('Decimal128')
    expect(raw.data.PRODUCT_TONNAGE?._bsontype).toBe('Decimal128')
    expect(raw.versions[0].data.GROSS_WEIGHT?._bsontype).toBe('Decimal128')
    expect(raw.versions[1].data.PRODUCT_TONNAGE?._bsontype).toBe('Decimal128')

    const domain = await repository.findByRegistration('org-1', 'reg-1')
    expect(domain[0].data.GROSS_WEIGHT).toBe(sourcePrecisionWeight)
    expect(domain[0].data.PRODUCT_TONNAGE).toBe(sourcePrecisionTonnage)
  })
})
