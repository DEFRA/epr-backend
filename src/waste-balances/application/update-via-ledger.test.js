import { describe, it, expect, vi, beforeEach } from 'vitest'

import { createInMemoryLedgerRepository } from '../repository/ledger-inmemory.js'
import { LEDGER_EVENT_KIND } from '../repository/ledger-schema.js'
import { LedgerSlotConflictError } from '../repository/ledger-port.js'
import { performUpdateViaLedger } from './update-via-ledger.js'
import { createWasteBalanceService } from './waste-balance-service.js'
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

/** @typedef {import('#domain/organisations/accreditation.js').Accreditation} Accreditation */

const accreditationId = 'acc-1'

const accreditation = /** @type {Accreditation} */ (
  /** @type {unknown} */ ({
    id: accreditationId,
    validFrom: '2023-01-01',
    validTo: '2030-12-31'
  })
)

const overseasSites = /** @type {*} */ (new Map())
const user = {
  id: 'user-1',
  name: 'Test User',
  email: 'user@example.test',
  scope: ['some-scope'],
  role: 'standard_user'
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

describe('performUpdateViaLedger', () => {
  let ledgerRepository
  let systemLogsRepository
  let commitSummaryLogSubmittedEvent

  beforeEach(async () => {
    ledgerRepository = createInMemoryLedgerRepository()()
    systemLogsRepository = createSystemLogsRepository()(logger)
    commitSummaryLogSubmittedEvent = createWasteBalanceService(
      ledgerRepository,
      systemLogsRepository
    ).commitSummaryLogSubmittedEvent
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

      await performUpdateViaLedger({
        wasteRecords: records,
        accreditation,
        commitSummaryLogSubmittedEvent,
        dependencies: { systemLogsRepository },
        user,
        overseasSites,
        summaryLogId: 'log-A'
      })

      const latest = await ledgerRepository.findLatestInLedger(
        'reg-1',
        accreditationId
      )
      expect(latest.number).toBe(1)
      expect(latest.kind).toBe(LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED)
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
      await performUpdateViaLedger({
        wasteRecords: [
          buildExporterRecord({ rowId: '1', tonnage: 100 }),
          buildExporterRecord({ rowId: '2', tonnage: 50 })
        ],
        accreditation,
        commitSummaryLogSubmittedEvent,
        dependencies: { systemLogsRepository },
        user,
        overseasSites,
        summaryLogId: 'log-A'
      })

      await performUpdateViaLedger({
        wasteRecords: [
          buildExporterRecord({ rowId: '1', tonnage: 100, versionId: 'v-1b' }),
          buildExporterRecord({ rowId: '2', tonnage: 80, versionId: 'v-2b' }),
          buildExporterRecord({ rowId: '3', tonnage: 20 })
        ],
        accreditation,
        commitSummaryLogSubmittedEvent,
        dependencies: { systemLogsRepository },
        user,
        overseasSites,
        summaryLogId: 'log-B'
      })

      const latest = await ledgerRepository.findLatestInLedger(
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

      await performUpdateViaLedger({
        wasteRecords: records,
        accreditation,
        commitSummaryLogSubmittedEvent,
        dependencies: { systemLogsRepository },
        user,
        overseasSites,
        summaryLogId: 'log-A'
      })

      const latest = await ledgerRepository.findLatestInLedger(
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

      await performUpdateViaLedger({
        wasteRecords: records,
        accreditation,
        commitSummaryLogSubmittedEvent,
        dependencies: { systemLogsRepository },
        user,
        overseasSites,
        summaryLogId: 'log-A'
      })

      const latest = await ledgerRepository.findLatestInLedger(
        'reg-1',
        accreditationId
      )
      expect(latest.payload.creditTotal).toBe(
        includedTonnages.reduce((sum, tonnage) => sum + tonnage, 0)
      )
    })
  })

  describe('empty input', () => {
    it('does not touch the ledger when no waste records are provided', async () => {
      const appendSpy = vi.spyOn(ledgerRepository, 'appendEvents')

      await performUpdateViaLedger({
        wasteRecords: [],
        accreditation,
        commitSummaryLogSubmittedEvent,
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
      await performUpdateViaLedger({
        wasteRecords: [
          buildExporterRecord({ rowId: '1', tonnage: 100 }),
          buildExporterRecord({ rowId: '2', tonnage: 50 })
        ],
        accreditation,
        commitSummaryLogSubmittedEvent,
        dependencies: { systemLogsRepository },
        user,
        overseasSites,
        summaryLogId: 'log-A'
      })

      const latest = await ledgerRepository.findLatestInLedger(
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
        events: [latest]
      })
    })
  })

  describe('without a system-logs repository', () => {
    it('appends the ledger event but emits no back-office audit', async () => {
      const auditlessSubmit =
        createWasteBalanceService(
          ledgerRepository
        ).commitSummaryLogSubmittedEvent

      await performUpdateViaLedger({
        wasteRecords: [buildExporterRecord({ rowId: '1', tonnage: 100 })],
        accreditation,
        commitSummaryLogSubmittedEvent: auditlessSubmit,
        dependencies: {},
        user,
        overseasSites,
        summaryLogId: 'log-A'
      })

      const latest = await ledgerRepository.findLatestInLedger(
        'reg-1',
        accreditationId
      )
      expect(latest.number).toBe(1)
      expect(latest.payload.creditTotal).toBe(100)

      const { systemLogs } = await systemLogsRepository.find({ limit: 10 })
      expect(systemLogs).toHaveLength(0)
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

      await performUpdateViaLedger({
        wasteRecords: [buildExporterRecord({ rowId: '1', tonnage: 100 })],
        accreditation,
        commitSummaryLogSubmittedEvent,
        dependencies: { systemLogsRepository },
        user,
        overseasSites,
        summaryLogId: 'log-A'
      })

      const latest = await ledgerRepository.findLatestInLedger(
        'reg-1',
        accreditationId
      )
      expect(latest.payload.creditTotal).toBe(0)
    })
  })

  describe('actor attribution', () => {
    it('stamps createdBy with the submitter id, name and email', async () => {
      await performUpdateViaLedger({
        wasteRecords: [buildExporterRecord({ rowId: '1', tonnage: 50 })],
        accreditation,
        commitSummaryLogSubmittedEvent,
        dependencies: { systemLogsRepository },
        user,
        overseasSites,
        summaryLogId: 'log-A'
      })

      const latest = await ledgerRepository.findLatestInLedger(
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
      await performUpdateViaLedger({
        wasteRecords: [buildExporterRecord({ rowId: '1', tonnage: 50 })],
        accreditation,
        commitSummaryLogSubmittedEvent,
        dependencies: { systemLogsRepository },
        user: {
          id: 'user-2',
          email: 'noname@example.test',
          scope: [],
          role: null
        },
        overseasSites,
        summaryLogId: 'log-A'
      })

      const latest = await ledgerRepository.findLatestInLedger(
        'reg-1',
        accreditationId
      )
      expect(latest.createdBy).toEqual({
        id: 'user-2',
        email: 'noname@example.test'
      })
    })
  })

  describe('optimistic concurrency', () => {
    it('lets one of two concurrent submissions win and surfaces the loser as a slot conflict', async () => {
      const submit = (summaryLogId, tonnage) =>
        performUpdateViaLedger({
          wasteRecords: [buildExporterRecord({ rowId: '1', tonnage })],
          accreditation,
          commitSummaryLogSubmittedEvent,
          dependencies: { systemLogsRepository },
          user,
          overseasSites,
          summaryLogId
        })

      const results = await Promise.allSettled([
        submit('log-A', 150),
        submit('log-B', 200)
      ])

      const fulfilled = results.filter((r) => r.status === 'fulfilled')
      const rejected = results.filter((r) => r.status === 'rejected')
      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      expect(rejected[0].reason).toBeInstanceOf(LedgerSlotConflictError)

      const all = await ledgerRepository.findAllInLedger(
        'reg-1',
        accreditationId
      )
      expect(all).toHaveLength(1)
    })
  })
})
