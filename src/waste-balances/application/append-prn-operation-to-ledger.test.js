import { describe, it, expect, vi, beforeEach } from 'vitest'

import { LedgerSlotConflictError } from '../repository/ledger-port.js'
import { LEDGER_PRN_OPERATION_TYPE } from '../repository/ledger-schema.js'
import { appendPrnOperationToLedger } from './append-prn-operation-to-ledger.js'

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

const buildLedgerRepository = ({ latest = null, inserted } = {}) => ({
  findLatestByAccreditationId: vi.fn().mockResolvedValue(latest),
  insertTransactions: vi.fn(async (transactions) => {
    if (inserted) {
      return inserted(transactions)
    }
    return transactions.map((t, i) => ({
      ...t,
      id: `txn-${t.number}-${i}`
    }))
  }),
  findLatestCreditedAmountsByWasteRecords: vi.fn(),
  deleteAllForAccreditationId: vi.fn()
})

const baseParams = () => ({
  accreditationId: 'acc-1',
  organisationId: 'org-1',
  registrationId: 'reg-1',
  prnId: 'prn-1',
  tonnage: 25,
  user: { id: 'user-1', email: 'user-1@example.com' }
})

describe('appendPrnOperationToLedger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('audit emission', () => {
    it('emits one safeAudit event after every successful append', async () => {
      const { audit } = await import('@defra/cdp-auditing')
      const ledgerRepository = buildLedgerRepository({
        latest: {
          number: 1,
          closingBalance: { amount: 200, availableAmount: 200 }
        }
      })

      await appendPrnOperationToLedger({
        ledgerRepository,
        systemLogsRepository: { insert: vi.fn() },
        ...baseParams(),
        operationType: LEDGER_PRN_OPERATION_TYPE.CREATED
      })

      expect(audit).toHaveBeenCalledTimes(1)
      const [payload] = vi.mocked(audit).mock.calls[0]
      expect(payload.event).toEqual({
        category: 'waste-reporting',
        subCategory: 'waste-balance',
        action: 'update'
      })
      expect(payload.context.accreditationId).toBe('acc-1')
      expect(payload.context.amount).toBe(200)
      expect(payload.context.availableAmount).toBe(175)
      expect(payload.context.newTransactions).toHaveLength(1)
    })

    it('inserts one system log entry per ledger append', async () => {
      const ledgerRepository = buildLedgerRepository()
      const systemLogsRepository = { insert: vi.fn() }

      await appendPrnOperationToLedger({
        ledgerRepository,
        systemLogsRepository,
        ...baseParams(),
        operationType: LEDGER_PRN_OPERATION_TYPE.CREATED
      })

      expect(systemLogsRepository.insert).toHaveBeenCalledTimes(1)
      const [entry] = systemLogsRepository.insert.mock.calls[0]
      expect(entry.event).toEqual({
        category: 'waste-reporting',
        subCategory: 'waste-balance',
        action: 'update'
      })
      expect(entry.createdBy).toEqual({
        id: 'user-1',
        email: 'user-1@example.com'
      })
    })

    it('still emits the safeAudit event when systemLogsRepository is omitted', async () => {
      const { audit } = await import('@defra/cdp-auditing')
      const ledgerRepository = buildLedgerRepository()

      await appendPrnOperationToLedger({
        ledgerRepository,
        ...baseParams(),
        operationType: LEDGER_PRN_OPERATION_TYPE.CREATED
      })

      expect(audit).toHaveBeenCalledTimes(1)
    })
  })

  describe('error handling', () => {
    it('rejects unknown operation types without touching the repository', async () => {
      const ledgerRepository = buildLedgerRepository()

      await expect(
        appendPrnOperationToLedger({
          ledgerRepository,
          systemLogsRepository: { insert: vi.fn() },
          ...baseParams(),
          operationType: 'sideways'
        })
      ).rejects.toThrow(/Unknown PRN ledger operation type/)

      expect(ledgerRepository.insertTransactions).not.toHaveBeenCalled()
    })

    it('propagates LedgerSlotConflictError without emitting audit', async () => {
      const { audit } = await import('@defra/cdp-auditing')
      const ledgerRepository = buildLedgerRepository({
        inserted: () => {
          throw new LedgerSlotConflictError('acc-1', 1)
        }
      })
      const systemLogsRepository = { insert: vi.fn() }

      await expect(
        appendPrnOperationToLedger({
          ledgerRepository,
          systemLogsRepository,
          ...baseParams(),
          operationType: LEDGER_PRN_OPERATION_TYPE.CREATED
        })
      ).rejects.toBeInstanceOf(LedgerSlotConflictError)

      expect(audit).not.toHaveBeenCalled()
      expect(systemLogsRepository.insert).not.toHaveBeenCalled()
    })
  })
})
