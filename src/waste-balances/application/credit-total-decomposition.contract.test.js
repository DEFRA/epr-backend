import { describe, it as base, expect, vi, beforeEach } from 'vitest'
import { MongoClient } from 'mongodb'

import { logger } from '#common/helpers/logging/logger.js'
import { add, toNumber } from '#common/helpers/decimal-utils.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import {
  WASTE_RECORD_TYPE,
  VERSION_STATUS
} from '#domain/waste-records/model.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { it as mongoIt } from '#vite/fixtures/mongo.js'

import { createInMemoryStreamRepository } from '../repository/stream-inmemory.js'
import { createInMemoryRowStateRepository } from '../repository/row-states-inmemory.js'
import {
  createMongoRowStateRepository,
  WASTE_BALANCE_ROW_STATES_COLLECTION_NAME
} from '../repository/row-states-mongodb.js'
import { STREAM_EVENT_KIND } from '../repository/stream-schema.js'
import { performUpdateViaStream } from './update-via-stream.js'

/**
 * Correctness proof for ADR-0037 Stage 1: a submission's `summary-log-submitted`
 * event `creditTotal` is exactly the decimal sum of the `transactionAmount`s of
 * the INCLUDED rows in that submission's committed membership. The proof reads
 * the event stream and the row-states repository directly — never the read
 * layer — so it ties the two independently written sources back together. It
 * runs against both row-state adapters because the membership dedup, where the
 * adapters could diverge, is exactly the behaviour the decomposition depends on.
 */

vi.mock('@defra/cdp-auditing', () => ({
  audit: vi.fn()
}))

vi.mock('#root/config.js', () => ({
  config: {
    get: vi.fn((key) =>
      key === 'audit.maxPayloadSizeBytes' ? 10000 : undefined
    )
  }
}))

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    warn: vi.fn()
  }
}))

vi.mock('#domain/summary-logs/table-schemas/index.js', () => ({
  findSchemaForProcessingType: vi.fn()
}))

const ZERO_TONNAGE_REASON = { code: 'ZERO_TONNAGE', field: 'tonnage' }

const tonnageClassifyingSchema = /** @type {*} */ ({
  classifyForWasteBalance: (data) =>
    data.tonnage > 0
      ? {
          outcome: ROW_OUTCOME.INCLUDED,
          reasons: [],
          transactionAmount: data.tonnage
        }
      : {
          outcome: ROW_OUTCOME.EXCLUDED,
          reasons: [ZERO_TONNAGE_REASON],
          transactionAmount: 0
        }
})

const ORGANISATION_ID = 'org-1'
const REGISTRATION_ID = 'reg-1'
const ACCREDITATION_ID = 'acc-1'
const DATABASE_NAME = 'epr-backend'

const accreditation = {
  id: ACCREDITATION_ID,
  validFrom: '2023-01-01',
  validTo: '2030-12-31'
}

const overseasSites = /** @type {*} */ (new Map())

const user = {
  id: 'user-1',
  name: 'Test User',
  email: 'user@example.test',
  scope: ['standard_user']
}

const buildRecord = ({ rowId, tonnage, summaryLogId }) => ({
  organisationId: ORGANISATION_ID,
  registrationId: REGISTRATION_ID,
  accreditationId: ACCREDITATION_ID,
  rowId: String(rowId),
  type: WASTE_RECORD_TYPE.EXPORTED,
  versions: [
    {
      id: `version-${rowId}-${summaryLogId}`,
      createdAt: '2025-01-20T10:00:00.000Z',
      status: VERSION_STATUS.CREATED,
      summaryLog: { id: summaryLogId, uri: 's3://bucket/log' },
      data: {}
    }
  ],
  data: { processingType: 'EXPORTER', tonnage },
  excludedFromWasteBalance: false
})

/**
 * A three-submission history on one partition exercising the row lifecycles the
 * decomposition must survive:
 * - row 1: INCLUDED throughout, reverting A->B->A (100.1, 150, 100.1) so its
 *   first state document is reused with a non-adjacent ['log-A','log-C']
 *   membership — the dedup the sum must not double-count;
 * - row 2: corrected from 50.1 to 80.2 then held (a new state, then membership
 *   growth) carrying tonnages that drift under naive float addition (e.g.
 *   100.1 + 80.2 + 20.4 is 200.70000000000002, not 200.7) so the proof checks
 *   the membership sum uses the same decimal arithmetic as the write path;
 * - row 3: reclassified EXCLUDED->INCLUDED->EXCLUDED, so an excluded state is
 *   both reused (A,C membership) and kept out of the sum while carrying a reason;
 * - row 4: a brand-new row appearing in B and held into C.
 */
const SUBMISSIONS = [
  {
    summaryLogId: 'log-A',
    rows: [
      { rowId: 1, tonnage: 100.1 },
      { rowId: 2, tonnage: 50.1 },
      { rowId: 3, tonnage: 0 }
    ],
    creditTotal: 150.2
  },
  {
    summaryLogId: 'log-B',
    rows: [
      { rowId: 1, tonnage: 150 },
      { rowId: 2, tonnage: 80.2 },
      { rowId: 3, tonnage: 5.3 },
      { rowId: 4, tonnage: 20.4 }
    ],
    creditTotal: 255.9
  },
  {
    summaryLogId: 'log-C',
    rows: [
      { rowId: 1, tonnage: 100.1 },
      { rowId: 2, tonnage: 80.2 },
      { rowId: 3, tonnage: 0 },
      { rowId: 4, tonnage: 20.4 }
    ],
    creditTotal: 200.7
  }
]

const submit = ({ summaryLogId, rows }, repositories) =>
  performUpdateViaStream({
    wasteRecords: rows.map((row) => buildRecord({ ...row, summaryLogId })),
    accreditation,
    streamRepository: repositories.streamRepository,
    rowStateRepository: repositories.rowStateRepository,
    dependencies: { systemLogsRepository: repositories.systemLogsRepository },
    user,
    overseasSites,
    summaryLogId
  })

const creditTotalsByCommittedSubmission = async (streamRepository) => {
  const events = await streamRepository.findAllByPartition(
    REGISTRATION_ID,
    ACCREDITATION_ID
  )
  return new Map(
    events
      .filter((event) => event.kind === STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED)
      .map((event) => {
        const payload =
          /** @type {import('../repository/stream-schema.js').SummaryLogSubmittedPayload} */ (
            event.payload
          )
        return [payload.summaryLogId, payload.creditTotal]
      })
  )
}

const decomposeIncludedTotal = (committedRowStates) =>
  committedRowStates
    .filter((doc) => doc.classification.outcome === ROW_OUTCOME.INCLUDED)
    .reduce(
      (sum, doc) => toNumber(add(sum, doc.classification.transactionAmount)),
      0
    )

const proveDecomposition = (it) => {
  it('reproduces every submission creditTotal by summing its INCLUDED committed row states', async ({
    rowStateRepository
  }) => {
    const repositories = {
      streamRepository: createInMemoryStreamRepository()(),
      rowStateRepository: rowStateRepository(),
      systemLogsRepository: createSystemLogsRepository()(logger)
    }

    for (const submission of SUBMISSIONS) {
      await submit(submission, repositories)
    }

    const creditTotals = await creditTotalsByCommittedSubmission(
      repositories.streamRepository
    )

    expect(creditTotals).toEqual(
      new Map(
        SUBMISSIONS.map((submission) => [
          submission.summaryLogId,
          submission.creditTotal
        ])
      )
    )

    for (const submission of SUBMISSIONS) {
      const committed =
        await repositories.rowStateRepository.findBySummaryLogId(
          submission.summaryLogId
        )
      expect(decomposeIncludedTotal(committed)).toBe(
        creditTotals.get(submission.summaryLogId)
      )
    }

    const rowOneHistory = await repositories.rowStateRepository.findRowHistory(
      ORGANISATION_ID,
      REGISTRATION_ID,
      '1',
      WASTE_RECORD_TYPE.EXPORTED
    )
    const revertedState = rowOneHistory.find(
      (doc) => doc.classification.transactionAmount === 100.1
    )
    expect(revertedState.summaryLogIds).toEqual(['log-A', 'log-C'])
  })

  it('shows a deliberately-excluded row carrying its reason code and contributing zero', async ({
    rowStateRepository
  }) => {
    const repositories = {
      streamRepository: createInMemoryStreamRepository()(),
      rowStateRepository: rowStateRepository(),
      systemLogsRepository: createSystemLogsRepository()(logger)
    }

    for (const submission of SUBMISSIONS) {
      await submit(submission, repositories)
    }

    const committedA =
      await repositories.rowStateRepository.findBySummaryLogId('log-A')
    const excluded = committedA.find((doc) => doc.rowId === '3')
    expect(excluded.classification.outcome).toBe(ROW_OUTCOME.EXCLUDED)
    expect(excluded.classification.transactionAmount).toBe(0)
    expect(excluded.classification.reasons).toContainEqual(ZERO_TONNAGE_REASON)
  })
}

beforeEach(async () => {
  const { findSchemaForProcessingType } =
    await import('#domain/summary-logs/table-schemas/index.js')
  vi.mocked(findSchemaForProcessingType).mockReturnValue(
    tonnageClassifyingSchema
  )
})

const inMemoryIt = base.extend({
  // eslint-disable-next-line no-empty-pattern
  rowStateRepository: async ({}, use) => {
    await use(createInMemoryRowStateRepository())
  }
})

const mongoBackedIt = mongoIt.extend({
  mongoClient: async (/** @type {*} */ { db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  rowStateRepository: async (/** @type {*} */ { mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    await database
      .collection(WASTE_BALANCE_ROW_STATES_COLLECTION_NAME)
      .deleteMany({})
    await use(await createMongoRowStateRepository(database))
  }
})

describe('creditTotal decomposition - in-memory row states', () => {
  proveDecomposition(inMemoryIt)
})

describe('creditTotal decomposition - mongodb row states', () => {
  proveDecomposition(mongoBackedIt)
})
