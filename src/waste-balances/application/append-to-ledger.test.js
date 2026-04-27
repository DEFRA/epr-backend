import { describe, it, expect, vi } from 'vitest'

import { createInMemoryLedgerRepository } from '../repository/ledger-inmemory.js'
import {
  LEDGER_PRN_OPERATION_TYPE,
  LEDGER_SOURCE_KIND,
  LEDGER_TRANSACTION_TYPE
} from '../repository/ledger-schema.js'
import { LedgerSlotConflictError } from '../repository/ledger-port.js'
import {
  appendToLedger,
  LedgerContentionError,
  MAX_LEDGER_APPEND_RETRIES
} from './append-to-ledger.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

const buildIdentity = (overrides = {}) => ({
  accreditationId: 'acc-1',
  organisationId: 'org-1',
  registrationId: 'reg-1',
  ...overrides
})

const summaryLogRowSource = {
  kind: LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW,
  summaryLogRow: {
    summaryLogId: 'log-1',
    rowId: 'row-1',
    rowType: WASTE_RECORD_TYPE.RECEIVED,
    wasteRecordId: 'waste-record-1',
    wasteRecordVersionId: 'version-1'
  }
}

const buildCreditFields = (latest, amount = 100) => ({
  type: LEDGER_TRANSACTION_TYPE.CREDIT,
  amount,
  openingAmount: latest.closingAmount,
  closingAmount: latest.closingAmount + amount,
  openingAvailableAmount: latest.closingAvailableAmount,
  closingAvailableAmount: latest.closingAvailableAmount + amount,
  source: summaryLogRowSource,
  createdBy: { id: 'user-1', name: 'Test User' },
  createdAt: new Date('2026-01-15T10:00:00.000Z')
})

describe('appendToLedger', () => {
  describe('happy path with no prior transactions', () => {
    it('invokes the builder with zero-valued latest', async () => {
      const repository = createInMemoryLedgerRepository()()
      const builder = vi.fn((latest) => buildCreditFields(latest))

      await appendToLedger({ repository, ...buildIdentity() }, builder)

      expect(builder).toHaveBeenCalledTimes(1)
      expect(builder).toHaveBeenCalledWith({
        number: 0,
        closingAmount: 0,
        closingAvailableAmount: 0
      })
    })

    it('inserts the first transaction with number 1 and identity fields', async () => {
      const repository = createInMemoryLedgerRepository()()

      const result = await appendToLedger(
        { repository, ...buildIdentity() },
        (latest) => buildCreditFields(latest)
      )

      expect(result.id).toEqual(expect.any(String))
      expect(result.number).toBe(1)
      expect(result.accreditationId).toBe('acc-1')
      expect(result.organisationId).toBe('org-1')
      expect(result.registrationId).toBe('reg-1')
      expect(result.openingAmount).toBe(0)
      expect(result.closingAmount).toBe(100)
      expect(result.openingAvailableAmount).toBe(0)
      expect(result.closingAvailableAmount).toBe(100)
    })
  })

  describe('happy path with prior transactions', () => {
    it('invokes the builder with the latest closing balances', async () => {
      const repository = createInMemoryLedgerRepository()()
      await appendToLedger({ repository, ...buildIdentity() }, (latest) =>
        buildCreditFields(latest, 70)
      )

      const builder = vi.fn((latest) => buildCreditFields(latest, 30))

      await appendToLedger({ repository, ...buildIdentity() }, builder)

      expect(builder).toHaveBeenCalledWith({
        number: 1,
        closingAmount: 70,
        closingAvailableAmount: 70
      })
    })

    it('assigns the next sequential number', async () => {
      const repository = createInMemoryLedgerRepository()()
      await appendToLedger({ repository, ...buildIdentity() }, (latest) =>
        buildCreditFields(latest, 70)
      )

      const second = await appendToLedger(
        { repository, ...buildIdentity() },
        (latest) => buildCreditFields(latest, 30)
      )

      expect(second.number).toBe(2)
      expect(second.openingAmount).toBe(70)
      expect(second.closingAmount).toBe(100)
    })

    it('ignores builder-returned accreditationId, organisationId, registrationId and number', async () => {
      const repository = createInMemoryLedgerRepository()()

      const result = await appendToLedger(
        { repository, ...buildIdentity() },
        (latest) => ({
          ...buildCreditFields(latest),
          accreditationId: 'acc-spoofed',
          organisationId: 'org-spoofed',
          registrationId: 'reg-spoofed',
          number: 999
        })
      )

      expect(result.accreditationId).toBe('acc-1')
      expect(result.organisationId).toBe('org-1')
      expect(result.registrationId).toBe('reg-1')
      expect(result.number).toBe(1)
    })

    it('preserves the source kind from the builder', async () => {
      const repository = createInMemoryLedgerRepository()()
      const result = await appendToLedger(
        { repository, ...buildIdentity() },
        (latest) => ({
          type: LEDGER_TRANSACTION_TYPE.PENDING_DEBIT,
          amount: -5,
          openingAmount: latest.closingAmount,
          closingAmount: latest.closingAmount,
          openingAvailableAmount: latest.closingAvailableAmount,
          closingAvailableAmount: latest.closingAvailableAmount - 5,
          source: {
            kind: LEDGER_SOURCE_KIND.PRN_OPERATION,
            prnOperation: {
              prnId: 'prn-1',
              operationType: LEDGER_PRN_OPERATION_TYPE.CREATION
            }
          },
          createdBy: { id: 'user-1', name: 'Test User' },
          createdAt: new Date('2026-01-15T10:00:00.000Z')
        })
      )

      expect(result.source.kind).toBe(LEDGER_SOURCE_KIND.PRN_OPERATION)
      expect(result.source.prnOperation.prnId).toBe('prn-1')
    })
  })

  describe('retry on slot conflict', () => {
    it('retries when insertTransaction raises LedgerSlotConflictError', async () => {
      const insertTransaction = vi
        .fn()
        .mockRejectedValueOnce(new LedgerSlotConflictError('acc-1', 1))
        .mockRejectedValueOnce(new LedgerSlotConflictError('acc-1', 2))
        .mockResolvedValueOnce({ id: 'stored', number: 3 })

      const findLatestByAccreditationId = vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          number: 1,
          closingAmount: 50,
          closingAvailableAmount: 50
        })
        .mockResolvedValueOnce({
          number: 2,
          closingAmount: 80,
          closingAvailableAmount: 80
        })

      const repository = {
        insertTransaction,
        findLatestByAccreditationId
      }

      const builder = vi.fn((latest) => buildCreditFields(latest, 30))

      const result = await appendToLedger(
        { repository, ...buildIdentity() },
        builder
      )

      expect(result.id).toBe('stored')
      expect(insertTransaction).toHaveBeenCalledTimes(3)
      expect(builder).toHaveBeenCalledTimes(3)
      expect(findLatestByAccreditationId).toHaveBeenCalledTimes(3)
    })

    it('throws LedgerContentionError after the configured retry budget is exhausted', async () => {
      const insertTransaction = vi
        .fn()
        .mockRejectedValue(new LedgerSlotConflictError('acc-1', 1))
      const findLatestByAccreditationId = vi.fn().mockResolvedValue(null)

      const repository = { insertTransaction, findLatestByAccreditationId }

      await expect(
        appendToLedger({ repository, ...buildIdentity() }, (latest) =>
          buildCreditFields(latest)
        )
      ).rejects.toBeInstanceOf(LedgerContentionError)

      expect(insertTransaction).toHaveBeenCalledTimes(MAX_LEDGER_APPEND_RETRIES)
    })

    it('LedgerContentionError carries accreditationId and attempt count', async () => {
      const insertTransaction = vi
        .fn()
        .mockRejectedValue(new LedgerSlotConflictError('acc-busy', 1))
      const findLatestByAccreditationId = vi.fn().mockResolvedValue(null)

      const repository = { insertTransaction, findLatestByAccreditationId }

      await expect(
        appendToLedger(
          { repository, ...buildIdentity({ accreditationId: 'acc-busy' }) },
          (latest) => buildCreditFields(latest)
        )
      ).rejects.toMatchObject({
        accreditationId: 'acc-busy',
        attempts: MAX_LEDGER_APPEND_RETRIES
      })
    })

    it('does not swallow non-conflict errors thrown by insertTransaction', async () => {
      const upstreamError = new Error('database is on fire')
      const insertTransaction = vi.fn().mockRejectedValue(upstreamError)
      const findLatestByAccreditationId = vi.fn().mockResolvedValue(null)

      const repository = { insertTransaction, findLatestByAccreditationId }

      await expect(
        appendToLedger({ repository, ...buildIdentity() }, (latest) =>
          buildCreditFields(latest)
        )
      ).rejects.toBe(upstreamError)

      expect(insertTransaction).toHaveBeenCalledTimes(1)
    })
  })
})
