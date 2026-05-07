import { describe, it, expect, vi, beforeEach } from 'vitest'

import { LedgerSlotConflictError } from '../repository/ledger-port.js'
import {
  LEDGER_PRN_OPERATION_TYPE,
  LEDGER_SOURCE_KIND,
  LEDGER_TRANSACTION_TYPE
} from '../repository/ledger-schema.js'
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

  describe('CREATED — ringfences availableAmount only', () => {
    it('emits a debit transaction starting from zero when no prior ledger entries exist', async () => {
      const ledgerRepository = buildLedgerRepository({ latest: null })
      const systemLogsRepository = { insert: vi.fn() }

      await appendPrnOperationToLedger({
        ledgerRepository,
        systemLogsRepository,
        ...baseParams(),
        operationType: LEDGER_PRN_OPERATION_TYPE.CREATED
      })

      expect(ledgerRepository.insertTransactions).toHaveBeenCalledTimes(1)
      const [[transaction]] = ledgerRepository.insertTransactions.mock.calls[0]
      expect(transaction.type).toBe(LEDGER_TRANSACTION_TYPE.DEBIT)
      expect(transaction.amount).toBe(25)
      expect(transaction.openingBalance).toEqual({
        amount: 0,
        availableAmount: 0
      })
      expect(transaction.closingBalance).toEqual({
        amount: 0,
        availableAmount: -25
      })
      expect(transaction.source).toEqual({
        kind: LEDGER_SOURCE_KIND.PRN_OPERATION,
        prnOperation: {
          prnId: 'prn-1',
          operationType: LEDGER_PRN_OPERATION_TYPE.CREATED
        }
      })
      expect(transaction.number).toBe(1)
      expect(transaction.accreditationId).toBe('acc-1')
      expect(transaction.organisationId).toBe('org-1')
      expect(transaction.registrationId).toBe('reg-1')
      expect(transaction.createdBy).toEqual({
        id: 'user-1',
        name: 'user-1@example.com'
      })
    })

    it('chains opening balance from the latest ledger transaction', async () => {
      const ledgerRepository = buildLedgerRepository({
        latest: {
          number: 7,
          closingBalance: { amount: 100, availableAmount: 80 }
        }
      })

      await appendPrnOperationToLedger({
        ledgerRepository,
        systemLogsRepository: { insert: vi.fn() },
        ...baseParams(),
        operationType: LEDGER_PRN_OPERATION_TYPE.CREATED
      })

      const [[transaction]] = ledgerRepository.insertTransactions.mock.calls[0]
      expect(transaction.number).toBe(8)
      expect(transaction.openingBalance).toEqual({
        amount: 100,
        availableAmount: 80
      })
      expect(transaction.closingBalance).toEqual({
        amount: 100,
        availableAmount: 55
      })
    })
  })

  describe('ISSUED — realises ringfence by debiting amount only', () => {
    it('reduces amount, leaves availableAmount alone', async () => {
      const ledgerRepository = buildLedgerRepository({
        latest: {
          number: 1,
          closingBalance: { amount: 100, availableAmount: 75 }
        }
      })

      await appendPrnOperationToLedger({
        ledgerRepository,
        systemLogsRepository: { insert: vi.fn() },
        ...baseParams(),
        operationType: LEDGER_PRN_OPERATION_TYPE.ISSUED
      })

      const [[transaction]] = ledgerRepository.insertTransactions.mock.calls[0]
      expect(transaction.type).toBe(LEDGER_TRANSACTION_TYPE.DEBIT)
      expect(transaction.amount).toBe(25)
      expect(transaction.closingBalance).toEqual({
        amount: 75,
        availableAmount: 75
      })
      expect(transaction.source.prnOperation.operationType).toBe(
        LEDGER_PRN_OPERATION_TYPE.ISSUED
      )
    })
  })

  describe('CANCELLED — releases ringfence on availableAmount', () => {
    it('credits availableAmount, leaves amount alone', async () => {
      const ledgerRepository = buildLedgerRepository({
        latest: {
          number: 2,
          closingBalance: { amount: 100, availableAmount: 75 }
        }
      })

      await appendPrnOperationToLedger({
        ledgerRepository,
        systemLogsRepository: { insert: vi.fn() },
        ...baseParams(),
        operationType: LEDGER_PRN_OPERATION_TYPE.CANCELLED
      })

      const [[transaction]] = ledgerRepository.insertTransactions.mock.calls[0]
      expect(transaction.type).toBe(LEDGER_TRANSACTION_TYPE.CREDIT)
      expect(transaction.closingBalance).toEqual({
        amount: 100,
        availableAmount: 100
      })
      expect(transaction.source.prnOperation.operationType).toBe(
        LEDGER_PRN_OPERATION_TYPE.CANCELLED
      )
    })
  })

  describe('ISSUED_CANCELLED — full reversal of an issued PRN', () => {
    it('credits both amount and availableAmount', async () => {
      const ledgerRepository = buildLedgerRepository({
        latest: {
          number: 3,
          closingBalance: { amount: 75, availableAmount: 75 }
        }
      })

      await appendPrnOperationToLedger({
        ledgerRepository,
        systemLogsRepository: { insert: vi.fn() },
        ...baseParams(),
        operationType: LEDGER_PRN_OPERATION_TYPE.ISSUED_CANCELLED
      })

      const [[transaction]] = ledgerRepository.insertTransactions.mock.calls[0]
      expect(transaction.type).toBe(LEDGER_TRANSACTION_TYPE.CREDIT)
      expect(transaction.closingBalance).toEqual({
        amount: 100,
        availableAmount: 100
      })
      expect(transaction.source.prnOperation.operationType).toBe(
        LEDGER_PRN_OPERATION_TYPE.ISSUED_CANCELLED
      )
    })
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
