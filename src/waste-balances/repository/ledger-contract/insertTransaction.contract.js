import { describe, beforeEach, expect } from 'vitest'

import { buildLedgerTransaction } from '../ledger-test-data.js'
import { LedgerSlotConflictError } from '../ledger-port.js'

export const testInsertTransactionBehaviour = (it) => {
  describe('insertTransaction', () => {
    let repository

    beforeEach(async ({ ledgerRepository }) => {
      repository = await ledgerRepository()
    })

    it('returns the stored transaction with an id', async () => {
      const transaction = buildLedgerTransaction({
        accreditationId: 'acc-round-trip',
        number: 1
      })

      const stored = await repository.insertTransaction(transaction)

      expect(stored.id).toEqual(expect.any(String))
      expect(stored.id).not.toBe('')
      expect(stored.accreditationId).toBe('acc-round-trip')
      expect(stored.number).toBe(1)
      expect(stored.amount).toBe(transaction.amount)
      expect(stored.opening).toEqual(transaction.opening)
      expect(stored.closing).toEqual(transaction.closing)
      expect(stored.source).toEqual(transaction.source)
    })

    it('persists distinct numbers for the same accreditation', async () => {
      await repository.insertTransaction(
        buildLedgerTransaction({ accreditationId: 'acc-multi', number: 1 })
      )
      await expect(
        repository.insertTransaction(
          buildLedgerTransaction({ accreditationId: 'acc-multi', number: 2 })
        )
      ).resolves.toBeDefined()
    })

    it('persists the same number across different accreditations', async () => {
      await repository.insertTransaction(
        buildLedgerTransaction({ accreditationId: 'acc-a', number: 1 })
      )
      await expect(
        repository.insertTransaction(
          buildLedgerTransaction({ accreditationId: 'acc-b', number: 1 })
        )
      ).resolves.toBeDefined()
    })

    it('throws LedgerSlotConflictError on duplicate (accreditationId, number)', async () => {
      await repository.insertTransaction(
        buildLedgerTransaction({ accreditationId: 'acc-conflict', number: 1 })
      )

      await expect(
        repository.insertTransaction(
          buildLedgerTransaction({ accreditationId: 'acc-conflict', number: 1 })
        )
      ).rejects.toBeInstanceOf(LedgerSlotConflictError)
    })

    it('LedgerSlotConflictError carries accreditationId and slotNumber', async () => {
      await repository.insertTransaction(
        buildLedgerTransaction({ accreditationId: 'acc-conflict-2', number: 7 })
      )

      await expect(
        repository.insertTransaction(
          buildLedgerTransaction({
            accreditationId: 'acc-conflict-2',
            number: 7
          })
        )
      ).rejects.toMatchObject({
        accreditationId: 'acc-conflict-2',
        slotNumber: 7
      })
    })
  })
}
