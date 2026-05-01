import { describe, it, expect, vi } from 'vitest'

import { createInMemoryLedgerRepository } from '../repository/ledger-inmemory.js'
import {
  LEDGER_SOURCE_KIND,
  LEDGER_TRANSACTION_TYPE
} from '../repository/ledger-schema.js'
import { LedgerSlotConflictError } from '../repository/ledger-port.js'
import { appendToLedger } from './append-to-ledger.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

const buildIdentity = (overrides = {}) => ({
  accreditationId: 'acc-1',
  organisationId: 'org-1',
  registrationId: 'reg-1',
  ...overrides
})

const buildSummaryLogRowSource = (rowId) => ({
  kind: LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW,
  summaryLogRow: {
    summaryLogId: 'log-1',
    wasteRecord: {
      type: WASTE_RECORD_TYPE.RECEIVED,
      rowId,
      versionId: `version-${rowId}`,
      creditedAmount: 0
    }
  }
})

const buildCreditFor = (rowId, amount) => (latest) => ({
  type: LEDGER_TRANSACTION_TYPE.CREDIT,
  amount,
  openingBalance: { ...latest.closingBalance },
  closingBalance: {
    amount: latest.closingBalance.amount + amount,
    availableAmount: latest.closingBalance.availableAmount + amount
  },
  source: buildSummaryLogRowSource(rowId),
  createdBy: { id: 'user-1', name: 'Test User' },
  createdAt: new Date('2026-01-15T10:00:00.000Z')
})

describe('appendToLedger', () => {
  describe('empty batch', () => {
    it('returns an empty array without touching the repository', async () => {
      const insertTransactions = vi.fn()
      const findLatestByAccreditationId = vi.fn()
      const repository = {
        insertTransactions,
        findLatestByAccreditationId
      }

      const result = await appendToLedger(
        { repository, ...buildIdentity() },
        []
      )

      expect(result).toEqual([])
      expect(findLatestByAccreditationId).not.toHaveBeenCalled()
      expect(insertTransactions).not.toHaveBeenCalled()
    })
  })

  describe('single-row batch', () => {
    it('reads latest once and inserts a single transaction', async () => {
      const repository = createInMemoryLedgerRepository()()
      const findLatestSpy = vi.spyOn(repository, 'findLatestByAccreditationId')
      const insertSpy = vi.spyOn(repository, 'insertTransactions')

      const [result] = await appendToLedger(
        { repository, ...buildIdentity() },
        [buildCreditFor('row-a', 25)]
      )

      expect(findLatestSpy).toHaveBeenCalledTimes(1)
      expect(insertSpy).toHaveBeenCalledTimes(1)
      expect(insertSpy.mock.calls[0][0]).toHaveLength(1)
      expect(result.id).toEqual(expect.any(String))
      expect(result.number).toBe(1)
      expect(result.openingBalance).toEqual({ amount: 0, availableAmount: 0 })
      expect(result.closingBalance).toEqual({ amount: 25, availableAmount: 25 })
      expect(result.source.kind).toBe(LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW)
    })
  })

  describe('multi-row batch', () => {
    it('chains opening/closing through the batch in memory', async () => {
      const repository = createInMemoryLedgerRepository()()

      const builderA = vi.fn(buildCreditFor('row-a', 100))
      const builderB = vi.fn(buildCreditFor('row-b', 30))
      const builderC = vi.fn(buildCreditFor('row-c', 70))

      const results = await appendToLedger({ repository, ...buildIdentity() }, [
        builderA,
        builderB,
        builderC
      ])

      expect(builderA).toHaveBeenCalledWith({
        number: 0,
        closingBalance: { amount: 0, availableAmount: 0 }
      })
      expect(builderB).toHaveBeenCalledWith({
        number: 1,
        closingBalance: { amount: 100, availableAmount: 100 }
      })
      expect(builderC).toHaveBeenCalledWith({
        number: 2,
        closingBalance: { amount: 130, availableAmount: 130 }
      })

      expect(results).toHaveLength(3)
      expect(results.map((t) => t.number)).toEqual([1, 2, 3])
      expect(results[2].closingBalance).toEqual({
        amount: 200,
        availableAmount: 200
      })
    })

    it('reads latest once for the whole batch', async () => {
      const repository = createInMemoryLedgerRepository()()
      const findLatestSpy = vi.spyOn(repository, 'findLatestByAccreditationId')

      await appendToLedger({ repository, ...buildIdentity() }, [
        buildCreditFor('row-a', 10),
        buildCreditFor('row-b', 20),
        buildCreditFor('row-c', 30)
      ])

      expect(findLatestSpy).toHaveBeenCalledTimes(1)
    })

    it('issues a single bulk insert call for the whole batch', async () => {
      const repository = createInMemoryLedgerRepository()()
      const insertSpy = vi.spyOn(repository, 'insertTransactions')

      await appendToLedger({ repository, ...buildIdentity() }, [
        buildCreditFor('row-a', 10),
        buildCreditFor('row-b', 20)
      ])

      expect(insertSpy).toHaveBeenCalledTimes(1)
      expect(insertSpy.mock.calls[0][0]).toHaveLength(2)
    })

    it('chains off the freshest observed snapshot', async () => {
      const repository = createInMemoryLedgerRepository()()

      await appendToLedger({ repository, ...buildIdentity() }, [
        buildCreditFor('row-a', 50)
      ])

      const builderB = vi.fn(buildCreditFor('row-b', 25))
      const builderC = vi.fn(buildCreditFor('row-c', 25))

      const results = await appendToLedger({ repository, ...buildIdentity() }, [
        builderB,
        builderC
      ])

      expect(builderB).toHaveBeenCalledWith({
        number: 1,
        closingBalance: { amount: 50, availableAmount: 50 }
      })
      expect(builderC).toHaveBeenCalledWith({
        number: 2,
        closingBalance: { amount: 75, availableAmount: 75 }
      })
      expect(results.map((t) => t.number)).toEqual([2, 3])
    })

    it('ignores builder-returned identity and number fields', async () => {
      const repository = createInMemoryLedgerRepository()()

      const [result] = await appendToLedger(
        { repository, ...buildIdentity() },
        [
          (latest) => ({
            ...buildCreditFor('row-a', 10)(latest),
            accreditationId: 'acc-spoofed',
            organisationId: 'org-spoofed',
            registrationId: 'reg-spoofed',
            number: 999
          })
        ]
      )

      expect(result.accreditationId).toBe('acc-1')
      expect(result.organisationId).toBe('org-1')
      expect(result.registrationId).toBe('reg-1')
      expect(result.number).toBe(1)
    })
  })

  describe('error propagation', () => {
    it('propagates LedgerSlotConflictError from the bulk insert', async () => {
      const slotConflict = new LedgerSlotConflictError('acc-1', 1)
      const insertTransactions = vi.fn().mockRejectedValue(slotConflict)
      const findLatestByAccreditationId = vi.fn().mockResolvedValue(null)

      const repository = {
        insertTransactions,
        findLatestByAccreditationId
      }

      await expect(
        appendToLedger({ repository, ...buildIdentity() }, [
          buildCreditFor('row-a', 10)
        ])
      ).rejects.toBe(slotConflict)

      expect(insertTransactions).toHaveBeenCalledTimes(1)
    })

    it('propagates non-conflict errors from the bulk insert', async () => {
      const upstream = new Error('database is on fire')
      const insertTransactions = vi.fn().mockRejectedValue(upstream)
      const findLatestByAccreditationId = vi.fn().mockResolvedValue(null)

      const repository = {
        insertTransactions,
        findLatestByAccreditationId
      }

      await expect(
        appendToLedger({ repository, ...buildIdentity() }, [
          buildCreditFor('row-a', 10)
        ])
      ).rejects.toBe(upstream)
    })
  })
})
