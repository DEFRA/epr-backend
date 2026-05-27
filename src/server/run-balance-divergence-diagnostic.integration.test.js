import { describe, expect, vi } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient, ObjectId } from 'mongodb'

import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import {
  summaryLogFactory,
  generateFileId
} from '#repositories/summary-logs/contract/test-data.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { computeRebuiltStream } from '#waste-balances/application/compute-rebuilt-stream.js'

import { toStreamSummaryLog } from './run-balance-divergence-diagnostic.js'

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn()
}))

vi.mock('#domain/summary-logs/table-schemas/index.js', () => ({
  findSchemaForProcessingType: vi.fn().mockReturnValue({
    classifyForWasteBalance: (/** @type {{ tonnage: number }} */ data) => ({
      outcome: ROW_OUTCOME.INCLUDED,
      transactionAmount: data.tonnage
    })
  })
}))

const DATABASE_NAME = 'epr-backend'

const mockS3Config = /** @type {any} */ ({})
const mockLogger = /** @type {any} */ ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
})

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    // @ts-expect-error vitest fixture types db as union, not string
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  // @ts-expect-error vitest cannot resolve chained fixture types
  summaryLogsRepository: async ({ mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    const factory = await createSummaryLogsRepository(database, mockS3Config)
    await use(factory(mockLogger))
  }
})

describe('balance divergence diagnostic (integration)', () => {
  // @ts-expect-error vitest cannot resolve chained fixture types
  it('stream replay produces correct creditTotal when summary log file.id is used to correlate waste record versions', async ({
    summaryLogsRepository
  }) => {
    const organisationId = new ObjectId().toString()
    const registrationId = new ObjectId().toString()
    const fileId = generateFileId()
    const docId = new ObjectId().toString()

    await summaryLogsRepository.insert(
      docId,
      summaryLogFactory.submitted({
        organisationId,
        registrationId,
        file: { id: fileId },
        submittedAt: '2025-01-15T10:00:00.000Z'
      })
    )

    const summaryLogDocs = await summaryLogsRepository.findAllByOrgReg(
      organisationId,
      registrationId
    )

    // The document _id and the file.id are different identifiers
    expect(summaryLogDocs[0].id).toBe(docId)
    expect(summaryLogDocs[0].summaryLog.file.id).toBe(fileId)
    expect(docId).not.toBe(fileId)

    // Map using the production helper — exercises the real mapping code
    const summaryLogs = summaryLogDocs.map(toStreamSummaryLog)

    // Waste records store file.id in versions[].summaryLog.id
    // (this is what sync-from-summary-log.js writes)
    const wasteRecords = [
      {
        organisationId,
        registrationId,
        type: 'received',
        data: { processingType: 'INPUT', tonnage: 202.47 },
        versions: [
          {
            summaryLog: { id: fileId },
            data: { processingType: 'INPUT', tonnage: 202.47 }
          }
        ],
        excludedFromWasteBalance: false
      }
    ]

    const result = computeRebuiltStream({
      accreditation: { id: 'acc-1' },
      wasteRecords,
      prns: [],
      overseasSites: {},
      summaryLogs
    })

    // If the mapping passes the wrong ID (doc._id instead of file.id),
    // reconstructDataAtSubmission returns null for every record and
    // creditTotal is 0 — the exact bug we observed in production
    expect(result.amount).toBe(202.47)
    expect(result.events).toHaveLength(1)
  })
})
