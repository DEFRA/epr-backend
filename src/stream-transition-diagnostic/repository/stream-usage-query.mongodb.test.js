import { randomUUID } from 'node:crypto'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { describe, expect, vi } from 'vitest'

import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { partialMock } from '#test/type-helpers.js'

import { createStreamUsageQuery } from './stream-usage-query.mongodb.js'

const DATABASE_NAME = 'epr-backend'
const SIXTY_SECONDS = 60

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn()
}))

const mockS3Config = {
  s3Client: partialMock({}),
  preSignedUrlExpiry: SIXTY_SECONDS
}

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

    summaryLogsCollection: async (/** @type {*} */ { database }, use) => {
      // Constructing the repository ensures the collection and its indexes.
      await createSummaryLogsRepository(database, mockS3Config)
      await use(database.collection('summary-logs'))
    },

    streamUsageQuery: async (/** @type {*} */ { database }, use) => {
      await use(createStreamUsageQuery(database))
    }
  })
)

const insertSummaryLog = async (collection, overrides = {}) => {
  const id = randomUUID()
  const log = summaryLogFactory.submitted(overrides)
  await collection.insertOne({ _id: id, version: 1, ...log })
  return id
}

describe('createStreamUsageQuery', () => {
  it('finds a pair whose submitted logs span both streams', async (/** @type {*} */ {
    summaryLogsCollection,
    streamUsageQuery
  }) => {
    await summaryLogsCollection.deleteMany({})

    const organisationId = 'org-1'
    const registrationId = 'reg-1'

    await insertSummaryLog(summaryLogsCollection, {
      organisationId,
      registrationId,
      submittedAt: '2026-01-15T00:00:00.000Z',
      meta: {
        PROCESSING_TYPE: 'REPROCESSOR_REGISTERED_ONLY',
        REGISTRATION_NUMBER: 'R26ER5000000001PL'
      }
    })
    await insertSummaryLog(summaryLogsCollection, {
      organisationId,
      registrationId,
      submittedAt: '2026-04-05T00:00:00.000Z',
      meta: {
        PROCESSING_TYPE: 'REPROCESSOR_OUTPUT',
        REGISTRATION_NUMBER: 'R26ER5000000001PL',
        ACCREDITATION_NUMBER: 'A26ER5000000001PL'
      }
    })

    const { scanned, usages } = await streamUsageQuery()

    expect(scanned).toBe(2)
    expect(usages).toHaveLength(1)
    expect(usages[0]).toMatchObject({
      organisationId,
      registrationId,
      registeredOnlySubmissions: 1,
      accreditedSubmissions: 1,
      registrationNumbers: ['R26ER5000000001PL'],
      accreditationNumbers: ['A26ER5000000001PL']
    })
    expect(
      new Date(usages[0].registeredOnlyLastSubmittedAt).toISOString()
    ).toBe('2026-01-15T00:00:00.000Z')
    expect(new Date(usages[0].accreditedFirstSubmittedAt).toISOString()).toBe(
      '2026-04-05T00:00:00.000Z'
    )
  })

  it('counts multiple submissions per stream', async (/** @type {*} */ {
    summaryLogsCollection,
    streamUsageQuery
  }) => {
    await summaryLogsCollection.deleteMany({})

    const organisationId = 'org-2'
    const registrationId = 'reg-2'
    const registeredOnlyMeta = {
      PROCESSING_TYPE: 'EXPORTER_REGISTERED_ONLY'
    }
    const accreditedMeta = { PROCESSING_TYPE: 'EXPORTER' }

    await insertSummaryLog(summaryLogsCollection, {
      organisationId,
      registrationId,
      submittedAt: '2026-01-01T00:00:00.000Z',
      meta: registeredOnlyMeta
    })
    await insertSummaryLog(summaryLogsCollection, {
      organisationId,
      registrationId,
      submittedAt: '2026-02-01T00:00:00.000Z',
      meta: registeredOnlyMeta
    })
    await insertSummaryLog(summaryLogsCollection, {
      organisationId,
      registrationId,
      submittedAt: '2026-05-01T00:00:00.000Z',
      meta: accreditedMeta
    })

    const { usages } = await streamUsageQuery()

    const usage = usages.find((u) => u.registrationId === registrationId)
    expect(usage.registeredOnlySubmissions).toBe(2)
    expect(usage.accreditedSubmissions).toBe(1)
  })

  it('excludes a pair whose logs are all on one stream', async (/** @type {*} */ {
    summaryLogsCollection,
    streamUsageQuery
  }) => {
    await summaryLogsCollection.deleteMany({})

    await insertSummaryLog(summaryLogsCollection, {
      organisationId: 'org-3',
      registrationId: 'reg-3',
      meta: { PROCESSING_TYPE: 'REPROCESSOR_OUTPUT' }
    })

    const { usages } = await streamUsageQuery()

    expect(usages.find((u) => u.registrationId === 'reg-3')).toBeUndefined()
  })

  it('excludes a non-submitted log from both the count and the stream match', async (/** @type {*} */ {
    summaryLogsCollection,
    streamUsageQuery
  }) => {
    await summaryLogsCollection.deleteMany({})

    const organisationId = 'org-4'
    const registrationId = 'reg-4'

    await insertSummaryLog(summaryLogsCollection, {
      organisationId,
      registrationId,
      meta: { PROCESSING_TYPE: 'REPROCESSOR_REGISTERED_ONLY' }
    })
    const rejected = summaryLogFactory.rejected({
      organisationId,
      registrationId,
      meta: { PROCESSING_TYPE: 'REPROCESSOR_OUTPUT' }
    })
    await summaryLogsCollection.insertOne({
      _id: randomUUID(),
      version: 1,
      ...rejected
    })

    const { usages } = await streamUsageQuery()

    expect(
      usages.find((u) => u.registrationId === registrationId)
    ).toBeUndefined()
  })

  it('excludes a submitted log with no meta.PROCESSING_TYPE', async (/** @type {*} */ {
    summaryLogsCollection,
    streamUsageQuery
  }) => {
    await summaryLogsCollection.deleteMany({})

    const organisationId = 'org-5'
    const registrationId = 'reg-5'

    await insertSummaryLog(summaryLogsCollection, {
      organisationId,
      registrationId,
      meta: { PROCESSING_TYPE: 'REPROCESSOR_REGISTERED_ONLY' }
    })
    await insertSummaryLog(summaryLogsCollection, {
      organisationId,
      registrationId
      // no meta at all
    })

    const { usages } = await streamUsageQuery()

    expect(
      usages.find((u) => u.registrationId === registrationId)
    ).toBeUndefined()
  })
})
