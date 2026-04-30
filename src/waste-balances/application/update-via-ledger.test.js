import { describe, it, expect, vi, beforeEach } from 'vitest'

import { createInMemoryLedgerRepository } from '../repository/ledger-inmemory.js'
import {
  LEDGER_SOURCE_KIND,
  LEDGER_TRANSACTION_TYPE
} from '../repository/ledger-schema.js'
import { performUpdateViaLedger } from './update-via-ledger.js'
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

const includingSchema = {
  classifyForWasteBalance: (data) => ({
    outcome: ROW_OUTCOME.INCLUDED,
    transactionAmount: data.tonnage
  })
}

vi.mock('#domain/summary-logs/table-schemas/index.js', () => ({
  findSchemaForProcessingType: vi.fn()
}))

const accreditationId = 'acc-1'

const accreditation = {
  id: accreditationId,
  validFrom: '2023-01-01',
  validTo: '2030-12-31'
}

const overseasSites = new Map()
const user = { id: 'user-1', name: 'Test User', email: 'user@example.test' }

const buildExporterRecord = ({
  rowId,
  tonnage,
  versionId = `version-${rowId}`,
  summaryLogId = 'log-1',
  updatedBy = { id: user.id, name: user.name }
}) => ({
  organisationId: 'org-1',
  registrationId: 'reg-1',
  accreditationId,
  rowId: String(rowId),
  type: WASTE_RECORD_TYPE.EXPORTED,
  ...(updatedBy ? { updatedBy } : {}),
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

  beforeEach(async () => {
    ledgerRepository = createInMemoryLedgerRepository()()
    systemLogsRepository = { insert: vi.fn().mockResolvedValue(undefined) }
    const { findSchemaForProcessingType } =
      await import('#domain/summary-logs/table-schemas/index.js')
    vi.mocked(findSchemaForProcessingType).mockReturnValue(includingSchema)
  })

  describe('first upload', () => {
    it('emits one ledger transaction per row with non-zero delta', async () => {
      const records = [
        buildExporterRecord({ rowId: '1', tonnage: 100 }),
        buildExporterRecord({ rowId: '2', tonnage: 50 })
      ]

      await performUpdateViaLedger({
        wasteRecords: records,
        accreditation,
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites
      })

      const latest = await ledgerRepository.findLatestByAccreditationId('acc-1')
      expect(latest.number).toBe(2)
      expect(latest.closingBalance).toEqual({
        amount: 150,
        availableAmount: 150
      })
    })

    it('chains opening/closing balances row by row', async () => {
      const records = [
        buildExporterRecord({ rowId: '1', tonnage: 100 }),
        buildExporterRecord({ rowId: '2', tonnage: 50 })
      ]

      await performUpdateViaLedger({
        wasteRecords: records,
        accreditation,
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites
      })

      const latest = await ledgerRepository.findLatestByAccreditationId('acc-1')
      expect(latest.openingBalance).toEqual({
        amount: 100,
        availableAmount: 100
      })
    })

    it('uses summary-log-row source kind with the wasteRecord sub-object', async () => {
      const record = buildExporterRecord({
        rowId: '7',
        tonnage: 30,
        versionId: 'v-7',
        summaryLogId: 'log-A'
      })

      await performUpdateViaLedger({
        wasteRecords: [record],
        accreditation,
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites
      })

      const latest = await ledgerRepository.findLatestByAccreditationId('acc-1')
      expect(latest.source).toEqual({
        kind: LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW,
        summaryLogRow: {
          summaryLogId: 'log-A',
          wasteRecord: {
            type: WASTE_RECORD_TYPE.EXPORTED,
            rowId: '7',
            versionId: 'v-7',
            creditedAmount: 30
          }
        }
      })
    })

    it('skips rows whose target amount is zero (excluded records)', async () => {
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
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites
      })

      const latest = await ledgerRepository.findLatestByAccreditationId('acc-1')
      expect(latest.number).toBe(1)
      expect(latest.closingBalance.amount).toBe(100)
    })
  })

  describe('idempotent re-upload', () => {
    it('emits zero transactions when re-upload has identical data', async () => {
      const records = [
        buildExporterRecord({ rowId: '1', tonnage: 100, versionId: 'v1-a' })
      ]

      await performUpdateViaLedger({
        wasteRecords: records,
        accreditation,
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites
      })

      const insertSpy = vi.spyOn(ledgerRepository, 'insertTransactions')

      const reUploadRecords = [
        buildExporterRecord({ rowId: '1', tonnage: 100, versionId: 'v1-b' })
      ]

      await performUpdateViaLedger({
        wasteRecords: reUploadRecords,
        accreditation,
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites
      })

      expect(insertSpy).not.toHaveBeenCalled()
    })

    it('emits a single delta when one row in a re-upload changed', async () => {
      const initial = [
        buildExporterRecord({ rowId: '1', tonnage: 100 }),
        buildExporterRecord({ rowId: '2', tonnage: 50 })
      ]

      await performUpdateViaLedger({
        wasteRecords: initial,
        accreditation,
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites
      })

      const reUpload = [
        buildExporterRecord({ rowId: '1', tonnage: 100, versionId: 'v-1b' }),
        buildExporterRecord({ rowId: '2', tonnage: 70, versionId: 'v-2b' })
      ]

      await performUpdateViaLedger({
        wasteRecords: reUpload,
        accreditation,
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites
      })

      const latest = await ledgerRepository.findLatestByAccreditationId('acc-1')
      expect(latest.number).toBe(3)
      expect(latest.type).toBe(LEDGER_TRANSACTION_TYPE.CREDIT)
      expect(latest.amount).toBe(20)
      expect(latest.closingBalance).toEqual({
        amount: 170,
        availableAmount: 170
      })
      expect(latest.source.summaryLogRow.wasteRecord).toEqual({
        type: WASTE_RECORD_TYPE.EXPORTED,
        rowId: '2',
        versionId: 'v-2b',
        creditedAmount: 70
      })
    })

    it('emits a debit when a re-upload reduces a tonnage', async () => {
      await performUpdateViaLedger({
        wasteRecords: [buildExporterRecord({ rowId: '1', tonnage: 100 })],
        accreditation,
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites
      })

      await performUpdateViaLedger({
        wasteRecords: [
          buildExporterRecord({ rowId: '1', tonnage: 30, versionId: 'v-1b' })
        ],
        accreditation,
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites
      })

      const latest = await ledgerRepository.findLatestByAccreditationId('acc-1')
      expect(latest.number).toBe(2)
      expect(latest.type).toBe(LEDGER_TRANSACTION_TYPE.DEBIT)
      expect(latest.amount).toBe(70)
      expect(latest.closingBalance).toEqual({ amount: 30, availableAmount: 30 })
    })

    it('converges multi-step delta chains to a stable target', async () => {
      await performUpdateViaLedger({
        wasteRecords: [buildExporterRecord({ rowId: '1', tonnage: 100 })],
        accreditation,
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites
      })

      await performUpdateViaLedger({
        wasteRecords: [
          buildExporterRecord({ rowId: '1', tonnage: 70, versionId: 'v-1b' })
        ],
        accreditation,
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites
      })

      await performUpdateViaLedger({
        wasteRecords: [
          buildExporterRecord({ rowId: '1', tonnage: 70, versionId: 'v-1c' })
        ],
        accreditation,
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites
      })

      const latest =
        await ledgerRepository.findLatestByAccreditationId(accreditationId)
      expect(latest.number).toBe(2)
      expect(latest.closingBalance).toEqual({ amount: 70, availableAmount: 70 })
    })

    it('stamps the running creditedAmount on each summary-log-row transaction', async () => {
      await performUpdateViaLedger({
        wasteRecords: [buildExporterRecord({ rowId: '1', tonnage: 100 })],
        accreditation,
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites
      })
      await performUpdateViaLedger({
        wasteRecords: [
          buildExporterRecord({ rowId: '1', tonnage: 30, versionId: 'v-1b' })
        ],
        accreditation,
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites
      })
      await performUpdateViaLedger({
        wasteRecords: [
          buildExporterRecord({ rowId: '1', tonnage: 90, versionId: 'v-1c' })
        ],
        accreditation,
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites
      })

      const latest = await ledgerRepository.findLatestByAccreditationId('acc-1')
      expect(latest.number).toBe(3)
      expect(latest.source.summaryLogRow.wasteRecord.creditedAmount).toBe(90)
    })
  })

  describe('partial-prior-submission recovery', () => {
    it('only emits the missing rows when an earlier batch landed K of N', async () => {
      const records = [
        buildExporterRecord({ rowId: '1', tonnage: 100 }),
        buildExporterRecord({ rowId: '2', tonnage: 50 }),
        buildExporterRecord({ rowId: '3', tonnage: 25 })
      ]

      await performUpdateViaLedger({
        wasteRecords: records.slice(0, 2),
        accreditation,
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites
      })

      await performUpdateViaLedger({
        wasteRecords: records,
        accreditation,
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites
      })

      const latest = await ledgerRepository.findLatestByAccreditationId('acc-1')
      expect(latest.number).toBe(3)
      expect(latest.closingBalance).toEqual({
        amount: 175,
        availableAmount: 175
      })
      expect(latest.source.summaryLogRow.wasteRecord).toEqual({
        type: WASTE_RECORD_TYPE.EXPORTED,
        rowId: '3',
        versionId: 'version-3',
        creditedAmount: 25
      })
    })
  })

  describe('audit emission', () => {
    it('inserts one system-log row covering the whole batch when transactions are emitted', async () => {
      await performUpdateViaLedger({
        wasteRecords: [
          buildExporterRecord({ rowId: '1', tonnage: 100 }),
          buildExporterRecord({ rowId: '2', tonnage: 50 })
        ],
        accreditation,
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites
      })

      expect(systemLogsRepository.insert).toHaveBeenCalledTimes(1)
      const [entry] = systemLogsRepository.insert.mock.calls[0]
      expect(entry.event).toEqual({
        category: 'waste-reporting',
        subCategory: 'waste-balance',
        action: 'update'
      })
      expect(entry.context.accreditationId).toBe('acc-1')
      expect(entry.context.amount).toBe(150)
      expect(entry.context.availableAmount).toBe(150)
      expect(entry.context.newTransactions).toHaveLength(2)
      expect(entry.createdBy).toBe(user)
    })

    it('emits no audit when no transactions are appended (idempotent re-upload)', async () => {
      const records = [buildExporterRecord({ rowId: '1', tonnage: 100 })]

      await performUpdateViaLedger({
        wasteRecords: records,
        accreditation,
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites
      })

      systemLogsRepository.insert.mockClear()

      await performUpdateViaLedger({
        wasteRecords: [
          buildExporterRecord({ rowId: '1', tonnage: 100, versionId: 'v-1b' })
        ],
        accreditation,
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites
      })

      expect(systemLogsRepository.insert).not.toHaveBeenCalled()
    })

    it('skips audit when user is anonymous', async () => {
      await performUpdateViaLedger({
        wasteRecords: [buildExporterRecord({ rowId: '1', tonnage: 100 })],
        accreditation,
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user: undefined,
        overseasSites
      })

      expect(systemLogsRepository.insert).not.toHaveBeenCalled()
    })

    it('falls back to transactionCount when payload exceeds audit size limit', async () => {
      const { config } = await import('#root/config.js')
      vi.mocked(config.get).mockImplementation((key) => {
        if (key === 'audit.maxPayloadSizeBytes') {
          return 400
        }
        return undefined
      })

      const { audit } = await import('@defra/cdp-auditing')
      vi.mocked(audit).mockClear()

      await performUpdateViaLedger({
        wasteRecords: [
          buildExporterRecord({ rowId: '1', tonnage: 100 }),
          buildExporterRecord({ rowId: '2', tonnage: 50 })
        ],
        accreditation,
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites
      })

      const auditCall = vi.mocked(audit).mock.calls[0][0]
      expect(auditCall.context.transactionCount).toBe(2)
      expect(auditCall.context.newTransactions).toBeUndefined()
    })
  })

  describe('empty input', () => {
    it('does not touch the ledger when no waste records are provided', async () => {
      const insertSpy = vi.spyOn(ledgerRepository, 'insertTransactions')

      await performUpdateViaLedger({
        wasteRecords: [],
        accreditation,
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites
      })

      expect(insertSpy).not.toHaveBeenCalled()
      expect(systemLogsRepository.insert).not.toHaveBeenCalled()
    })
  })

  describe('classifier outcome', () => {
    it('treats records with non-INCLUDED outcome as zero-target', async () => {
      const { findSchemaForProcessingType } =
        await import('#domain/summary-logs/table-schemas/index.js')
      vi.mocked(findSchemaForProcessingType).mockReturnValueOnce({
        classifyForWasteBalance: () => ({
          outcome: 'ignored',
          reasons: [{ code: 'OUTSIDE_ACCREDITATION_PERIOD' }]
        })
      })

      const insertSpy = vi.spyOn(ledgerRepository, 'insertTransactions')

      await performUpdateViaLedger({
        wasteRecords: [buildExporterRecord({ rowId: '1', tonnage: 100 })],
        accreditation,
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites
      })

      expect(insertSpy).not.toHaveBeenCalled()
    })
  })

  describe('schema not found', () => {
    it('treats records as zero-target when no classifier exists for their processing type', async () => {
      const { findSchemaForProcessingType } =
        await import('#domain/summary-logs/table-schemas/index.js')
      vi.mocked(findSchemaForProcessingType).mockReturnValueOnce(null)

      const insertSpy = vi.spyOn(ledgerRepository, 'insertTransactions')

      await performUpdateViaLedger({
        wasteRecords: [buildExporterRecord({ rowId: '1', tonnage: 100 })],
        accreditation,
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites
      })

      expect(insertSpy).not.toHaveBeenCalled()
    })
  })

  describe('missing updatedBy', () => {
    it('persists ledger transactions when records have no updatedBy (system-driven sync)', async () => {
      const recordWithoutUser = buildExporterRecord({
        rowId: '1',
        tonnage: 50,
        updatedBy: null
      })

      await performUpdateViaLedger({
        wasteRecords: [recordWithoutUser],
        accreditation,
        ledgerRepository,
        dependencies: { systemLogsRepository },
        user,
        overseasSites
      })

      const latest = await ledgerRepository.findLatestByAccreditationId('acc-1')
      expect(latest).not.toBeNull()
      expect(latest.createdBy).toBeUndefined()
      expect(latest.amount).toBe(50)
    })
  })

  describe('audit without system logs repository', () => {
    it('still emits the safeAudit event when systemLogsRepository is omitted', async () => {
      const { audit } = await import('@defra/cdp-auditing')
      vi.mocked(audit).mockClear()

      await performUpdateViaLedger({
        wasteRecords: [buildExporterRecord({ rowId: '1', tonnage: 100 })],
        accreditation,
        ledgerRepository,
        dependencies: {},
        user,
        overseasSites
      })

      expect(vi.mocked(audit)).toHaveBeenCalledTimes(1)
    })
  })
})
