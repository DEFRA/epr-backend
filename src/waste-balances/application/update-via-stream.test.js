import { describe, it, expect, vi, beforeEach } from 'vitest'

import { createInMemoryStreamRepository } from '../repository/stream-inmemory.js'
import { createInMemoryRowStateRepository } from '#waste-records/repository/inmemory.js'
import { STREAM_EVENT_KIND } from '../repository/stream-schema.js'
import { performUpdateViaStream } from './update-via-stream.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { logger } from '#common/helpers/logging/logger.js'
import {
  WASTE_RECORD_TYPE,
  VERSION_STATUS
} from '#domain/waste-records/model.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

vi.mock('@defra/cdp-auditing', () => ({
  audit: vi.fn()
}))

vi.mock('#root/config.js', () => ({
  config: {
    get: vi.fn((key) => {
      if (key === 'audit.maxPayloadSizeBytes') {
        return 10000
      }
      return undefined
    })
  }
}))

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    warn: vi.fn()
  }
}))

const includingSchema = /** @type {*} */ ({
  classifyForWasteBalance: (data) => ({
    outcome: ROW_OUTCOME.INCLUDED,
    reasons: [],
    transactionAmount: data.tonnage
  })
})

vi.mock('#domain/summary-logs/table-schemas/index.js', () => ({
  findSchemaForProcessingType: vi.fn()
}))

const accreditationId = 'acc-1'

const accreditation = {
  id: accreditationId,
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

const buildExporterRecord = ({
  rowId,
  tonnage,
  versionId = `version-${rowId}`,
  summaryLogId = 'log-1'
}) => ({
  organisationId: 'org-1',
  registrationId: 'reg-1',
  accreditationId,
  rowId: String(rowId),
  type: WASTE_RECORD_TYPE.EXPORTED,
  versions: [
    {
      id: versionId,
      createdAt: '2025-01-20T10:00:00.000Z',
      status: VERSION_STATUS.CREATED,
      summaryLog: { id: summaryLogId, uri: 's3://bucket/log' },
      data: {}
    }
  ],
  data: { processingType: 'EXPORTER', tonnage },
  excludedFromWasteBalance: false
})

describe('performUpdateViaStream', () => {
  let streamRepository
  let rowStateRepository
  let systemLogsRepository

  beforeEach(async () => {
    streamRepository = createInMemoryStreamRepository()()
    rowStateRepository = createInMemoryRowStateRepository()()
    systemLogsRepository = createSystemLogsRepository()(logger)
    const { findSchemaForProcessingType } =
      await import('#domain/summary-logs/table-schemas/index.js')
    vi.mocked(findSchemaForProcessingType).mockReturnValue(includingSchema)
  })

  describe('first submission', () => {
    it('appends a single summary-log-submitted event with aggregate creditTotal', async () => {
      const records = [
        buildExporterRecord({ rowId: '1', tonnage: 100 }),
        buildExporterRecord({ rowId: '2', tonnage: 50 })
      ]

      await performUpdateViaStream({
        wasteRecords: records,
        accreditation,
        streamRepository,
        rowStateRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites,
        summaryLogId: 'log-A'
      })

      const latest = await streamRepository.findLatestByPartition(
        'reg-1',
        accreditationId
      )
      expect(latest.number).toBe(1)
      expect(latest.kind).toBe(STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED)
      expect(latest.payload).toEqual({
        summaryLogId: 'log-A',
        creditTotal: 150
      })
      expect(latest.closingBalance).toEqual({
        amount: 150,
        availableAmount: 150
      })
    })
  })

  describe('subsequent submission', () => {
    it('computes delta from previous creditTotal', async () => {
      await performUpdateViaStream({
        wasteRecords: [
          buildExporterRecord({ rowId: '1', tonnage: 100 }),
          buildExporterRecord({ rowId: '2', tonnage: 50 })
        ],
        accreditation,
        streamRepository,
        rowStateRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites,
        summaryLogId: 'log-A'
      })

      await performUpdateViaStream({
        wasteRecords: [
          buildExporterRecord({ rowId: '1', tonnage: 100, versionId: 'v-1b' }),
          buildExporterRecord({ rowId: '2', tonnage: 80, versionId: 'v-2b' }),
          buildExporterRecord({ rowId: '3', tonnage: 20 })
        ],
        accreditation,
        streamRepository,
        rowStateRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites,
        summaryLogId: 'log-B'
      })

      const latest = await streamRepository.findLatestByPartition(
        'reg-1',
        accreditationId
      )
      expect(latest.number).toBe(2)
      expect(latest.payload).toEqual({
        summaryLogId: 'log-B',
        creditTotal: 200
      })
      expect(latest.closingBalance).toEqual({
        amount: 200,
        availableAmount: 200
      })
    })
  })

  describe('excluded records', () => {
    it('skips records with excludedFromWasteBalance flag', async () => {
      const records = [
        buildExporterRecord({ rowId: '1', tonnage: 100 }),
        {
          ...buildExporterRecord({ rowId: '2', tonnage: 50 }),
          excludedFromWasteBalance: true
        }
      ]

      await performUpdateViaStream({
        wasteRecords: records,
        accreditation,
        streamRepository,
        rowStateRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites,
        summaryLogId: 'log-A'
      })

      const latest = await streamRepository.findLatestByPartition(
        'reg-1',
        accreditationId
      )
      expect(latest.payload.creditTotal).toBe(100)
    })
  })

  describe('credit total invariant', () => {
    it('sums exactly the INCLUDED transaction amounts, dropping excluded rows', async () => {
      const includedTonnages = [120, 30, 45]
      const records = [
        buildExporterRecord({ rowId: '1', tonnage: includedTonnages[0] }),
        buildExporterRecord({ rowId: '2', tonnage: includedTonnages[1] }),
        {
          ...buildExporterRecord({ rowId: '3', tonnage: 999 }),
          excludedFromWasteBalance: true
        },
        buildExporterRecord({ rowId: '4', tonnage: includedTonnages[2] })
      ]

      await performUpdateViaStream({
        wasteRecords: records,
        accreditation,
        streamRepository,
        rowStateRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites,
        summaryLogId: 'log-A'
      })

      const latest = await streamRepository.findLatestByPartition(
        'reg-1',
        accreditationId
      )
      expect(latest.payload.creditTotal).toBe(
        includedTonnages.reduce((sum, tonnage) => sum + tonnage, 0)
      )
    })
  })

  describe('empty input', () => {
    it('does not touch the stream when no waste records are provided', async () => {
      const appendSpy = vi.spyOn(streamRepository, 'appendEvent')

      await performUpdateViaStream({
        wasteRecords: [],
        accreditation,
        streamRepository,
        rowStateRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites,
        summaryLogId: 'log-A'
      })

      expect(appendSpy).not.toHaveBeenCalled()
      const { systemLogs } = await systemLogsRepository.find({ limit: 10 })
      expect(systemLogs).toHaveLength(0)
    })
  })

  describe('audit emission', () => {
    it('inserts one system-log entry covering the submission', async () => {
      await performUpdateViaStream({
        wasteRecords: [
          buildExporterRecord({ rowId: '1', tonnage: 100 }),
          buildExporterRecord({ rowId: '2', tonnage: 50 })
        ],
        accreditation,
        streamRepository,
        rowStateRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites,
        summaryLogId: 'log-A'
      })

      const latest = await streamRepository.findLatestByPartition(
        'reg-1',
        accreditationId
      )

      const { systemLogs } = await systemLogsRepository.find({ limit: 10 })
      expect(systemLogs).toHaveLength(1)
      const [entry] = systemLogs
      expect(entry.createdBy).toEqual({ ...user, role: null })
      expect(entry.createdAt).toBeInstanceOf(Date)
      expect(entry.event).toEqual({
        category: 'waste-reporting',
        subCategory: 'waste-balance',
        action: 'update'
      })
      expect(entry.context).toEqual({
        accreditationId,
        amount: 150,
        availableAmount: 150,
        newTransactions: [latest]
      })
    })
  })

  describe('classifier outcome', () => {
    it('treats records with non-INCLUDED outcome as zero contribution', async () => {
      const { findSchemaForProcessingType } =
        await import('#domain/summary-logs/table-schemas/index.js')
      vi.mocked(findSchemaForProcessingType).mockReturnValue(
        /** @type {*} */ ({
          classifyForWasteBalance: () => ({
            outcome: ROW_OUTCOME.IGNORED,
            reasons: [{ code: 'OUTSIDE_ACCREDITATION_PERIOD' }]
          })
        })
      )

      await performUpdateViaStream({
        wasteRecords: [buildExporterRecord({ rowId: '1', tonnage: 100 })],
        accreditation,
        streamRepository,
        rowStateRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites,
        summaryLogId: 'log-A'
      })

      const latest = await streamRepository.findLatestByPartition(
        'reg-1',
        accreditationId
      )
      expect(latest.payload.creditTotal).toBe(0)
    })
  })

  describe('actor attribution', () => {
    it('stamps createdBy with the submitter id, name and email', async () => {
      await performUpdateViaStream({
        wasteRecords: [buildExporterRecord({ rowId: '1', tonnage: 50 })],
        accreditation,
        streamRepository,
        rowStateRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites,
        summaryLogId: 'log-A'
      })

      const latest = await streamRepository.findLatestByPartition(
        'reg-1',
        accreditationId
      )
      expect(latest.createdBy).toEqual({
        id: user.id,
        name: user.name,
        email: user.email
      })
    })

    it('omits name when the submitter has none, keeping the email distinct', async () => {
      await performUpdateViaStream({
        wasteRecords: [buildExporterRecord({ rowId: '1', tonnage: 50 })],
        accreditation,
        streamRepository,
        rowStateRepository,
        dependencies: { systemLogsRepository },
        user: { id: 'user-2', email: 'noname@example.test', scope: [] },
        overseasSites,
        summaryLogId: 'log-A'
      })

      const latest = await streamRepository.findLatestByPartition(
        'reg-1',
        accreditationId
      )
      expect(latest.createdBy).toEqual({
        id: 'user-2',
        email: 'noname@example.test'
      })
    })
  })

  describe('waste record states', () => {
    const submit = (wasteRecords, summaryLogId) =>
      performUpdateViaStream({
        wasteRecords,
        accreditation,
        streamRepository,
        rowStateRepository,
        dependencies: {
          systemLogsRepository,
          featureFlags: createInMemoryFeatureFlags({ wasteRecordStates: true })
        },
        user,
        overseasSites,
        summaryLogId
      })

    it('persists the full waste record state of the submission, including excluded rows', async () => {
      await submit(
        [
          buildExporterRecord({ rowId: '1', tonnage: 100 }),
          buildExporterRecord({ rowId: '2', tonnage: 50 }),
          {
            ...buildExporterRecord({ rowId: '3', tonnage: 999 }),
            excludedFromWasteBalance: true
          }
        ],
        'log-A'
      )

      const committed = await rowStateRepository.findBySummaryLogId('log-A')
      expect(committed.map((doc) => doc.rowId).sort()).toEqual(['1', '2', '3'])
      expect(committed.find((doc) => doc.rowId === '1')).toMatchObject({
        organisationId: 'org-1',
        registrationId: 'reg-1',
        accreditationId,
        wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
        data: { processingType: 'EXPORTER', tonnage: 100 },
        classification: {
          outcome: ROW_OUTCOME.INCLUDED,
          reasons: [],
          transactionAmount: 100
        },
        summaryLogIds: ['log-A']
      })
      expect(committed.find((doc) => doc.rowId === '3').classification).toEqual(
        {
          outcome: ROW_OUTCOME.EXCLUDED,
          reasons: [],
          transactionAmount: 0
        }
      )
    })

    it('is idempotent — re-submitting the same content adds no duplicate document or membership entry', async () => {
      const records = [buildExporterRecord({ rowId: '1', tonnage: 100 })]

      await submit(records, 'log-A')
      await submit(records, 'log-A')

      const committed = await rowStateRepository.findBySummaryLogId('log-A')
      expect(committed).toHaveLength(1)
      expect(committed[0].summaryLogIds).toEqual(['log-A'])
    })

    it('grows membership for an unchanged row and inserts a new state for a changed row', async () => {
      await submit([buildExporterRecord({ rowId: '1', tonnage: 100 })], 'log-A')
      await submit(
        [buildExporterRecord({ rowId: '1', tonnage: 100, versionId: 'v2' })],
        'log-B'
      )
      await submit(
        [buildExporterRecord({ rowId: '1', tonnage: 250, versionId: 'v3' })],
        'log-C'
      )

      const history = await rowStateRepository.findRowHistory(
        'org-1',
        'reg-1',
        '1',
        WASTE_RECORD_TYPE.EXPORTED
      )
      expect(history).toHaveLength(2)
      expect(
        history.find((doc) => doc.classification.transactionAmount === 100)
          .summaryLogIds
      ).toEqual(['log-A', 'log-B'])
      expect(
        history.find((doc) => doc.classification.transactionAmount === 250)
          .summaryLogIds
      ).toEqual(['log-C'])
    })

    it('writes row states without disturbing the event payload or closing balance', async () => {
      await submit(
        [
          buildExporterRecord({ rowId: '1', tonnage: 100 }),
          buildExporterRecord({ rowId: '2', tonnage: 50 })
        ],
        'log-A'
      )

      const latest = await streamRepository.findLatestByPartition(
        'reg-1',
        accreditationId
      )
      expect(latest.payload).toEqual({
        summaryLogId: 'log-A',
        creditTotal: 150
      })
      expect(latest.closingBalance).toEqual({
        amount: 150,
        availableAmount: 150
      })
      expect(await rowStateRepository.findBySummaryLogId('log-A')).toHaveLength(
        2
      )
    })

    it('persists row states before appending the event, so a failed append leaves the row state written for an idempotent retry', async () => {
      const records = [buildExporterRecord({ rowId: '1', tonnage: 100 })]
      vi.spyOn(streamRepository, 'appendEvent').mockRejectedValueOnce(
        new Error('append boom')
      )

      await expect(submit(records, 'log-A')).rejects.toThrow('append boom')
      expect(await rowStateRepository.findBySummaryLogId('log-A')).toHaveLength(
        1
      )

      await submit(records, 'log-A')

      const committed = await rowStateRepository.findBySummaryLogId('log-A')
      expect(committed).toHaveLength(1)
      expect(committed[0].summaryLogIds).toEqual(['log-A'])
    })
  })

  describe('waste-record-states feature flag', () => {
    const submitWith = (featureFlags) =>
      performUpdateViaStream({
        wasteRecords: [buildExporterRecord({ rowId: '1', tonnage: 100 })],
        accreditation,
        streamRepository,
        rowStateRepository,
        dependencies: { systemLogsRepository, featureFlags },
        user,
        overseasSites,
        summaryLogId: 'log-A'
      })

    it('writes no row states and appends the event unchanged when the flag is off', async () => {
      await submitWith(createInMemoryFeatureFlags({ wasteRecordStates: false }))

      expect(await rowStateRepository.findBySummaryLogId('log-A')).toHaveLength(
        0
      )
      const latest = await streamRepository.findLatestByPartition(
        'reg-1',
        accreditationId
      )
      expect(latest.payload).toEqual({
        summaryLogId: 'log-A',
        creditTotal: 100
      })
      expect(latest.closingBalance).toEqual({
        amount: 100,
        availableAmount: 100
      })
    })

    it('writes waste record states when the flag is on', async () => {
      await submitWith(createInMemoryFeatureFlags({ wasteRecordStates: true }))

      expect(await rowStateRepository.findBySummaryLogId('log-A')).toHaveLength(
        1
      )
    })
  })
})
