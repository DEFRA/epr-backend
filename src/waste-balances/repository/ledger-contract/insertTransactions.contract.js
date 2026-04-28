import { describe, beforeEach, expect } from 'vitest'

import { buildLedgerTransaction } from '../ledger-test-data.js'
import { LedgerSlotConflictError } from '../ledger-port.js'

export const testInsertTransactionsBehaviour = (it) => {
  describe('insertTransactions', () => {
    let repository

    beforeEach(async ({ ledgerRepository }) => {
      repository = await ledgerRepository()
    })

    it('returns an empty array for an empty input', async () => {
      const stored = await repository.insertTransactions([])
      expect(stored).toEqual([])
    })

    it('persists a single-row batch and returns the stored transaction', async () => {
      const transaction = buildLedgerTransaction({
        accreditationId: 'acc-single',
        number: 1
      })

      const [stored] = await repository.insertTransactions([transaction])

      expect(stored.id).toEqual(expect.any(String))
      expect(stored.id).not.toBe('')
      expect(stored.accreditationId).toBe('acc-single')
      expect(stored.number).toBe(1)
      expect(stored.amount).toBe(transaction.amount)
      expect(stored.openingBalance).toEqual(transaction.openingBalance)
      expect(stored.closingBalance).toEqual(transaction.closingBalance)
      expect(stored.source).toEqual(transaction.source)
    })

    it('persists a multi-row batch and returns transactions in input order', async () => {
      const stored = await repository.insertTransactions([
        buildLedgerTransaction({ accreditationId: 'acc-multi', number: 1 }),
        buildLedgerTransaction({ accreditationId: 'acc-multi', number: 2 }),
        buildLedgerTransaction({ accreditationId: 'acc-multi', number: 3 })
      ])

      expect(stored).toHaveLength(3)
      expect(stored.map((t) => t.number)).toEqual([1, 2, 3])
      stored.forEach((t) => {
        expect(t.id).toEqual(expect.any(String))
      })
    })

    it('persists distinct numbers for the same accreditation across calls', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({ accreditationId: 'acc-multi-call', number: 1 })
      ])
      await expect(
        repository.insertTransactions([
          buildLedgerTransaction({
            accreditationId: 'acc-multi-call',
            number: 2
          })
        ])
      ).resolves.toBeDefined()
    })

    it('persists the same number across different accreditations', async () => {
      await expect(
        repository.insertTransactions([
          buildLedgerTransaction({ accreditationId: 'acc-a', number: 1 }),
          buildLedgerTransaction({ accreditationId: 'acc-b', number: 1 })
        ])
      ).resolves.toHaveLength(2)
    })

    it('throws LedgerSlotConflictError when a slot is already occupied', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({ accreditationId: 'acc-conflict', number: 1 })
      ])

      await expect(
        repository.insertTransactions([
          buildLedgerTransaction({
            accreditationId: 'acc-conflict',
            number: 1
          })
        ])
      ).rejects.toBeInstanceOf(LedgerSlotConflictError)
    })

    it('LedgerSlotConflictError carries accreditationId and slotNumber of the colliding row', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({ accreditationId: 'acc-conflict-2', number: 7 })
      ])

      await expect(
        repository.insertTransactions([
          buildLedgerTransaction({
            accreditationId: 'acc-conflict-2',
            number: 7
          })
        ])
      ).rejects.toMatchObject({
        accreditationId: 'acc-conflict-2',
        slotNumber: 7
      })
    })

    it('throws LedgerSlotConflictError when a slot collides mid-batch (ordered early-stop)', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          accreditationId: 'acc-mid-batch',
          number: 2
        })
      ])

      await expect(
        repository.insertTransactions([
          buildLedgerTransaction({
            accreditationId: 'acc-mid-batch',
            number: 1
          }),
          buildLedgerTransaction({
            accreditationId: 'acc-mid-batch',
            number: 2
          }),
          buildLedgerTransaction({
            accreditationId: 'acc-mid-batch',
            number: 3
          })
        ])
      ).rejects.toMatchObject({
        accreditationId: 'acc-mid-batch',
        slotNumber: 2
      })
    })

    it('leaves rows before a mid-batch conflict persisted (partial-batch acceptable)', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          accreditationId: 'acc-partial',
          number: 2
        })
      ])

      await repository
        .insertTransactions([
          buildLedgerTransaction({
            accreditationId: 'acc-partial',
            number: 1
          }),
          buildLedgerTransaction({
            accreditationId: 'acc-partial',
            number: 2
          }),
          buildLedgerTransaction({
            accreditationId: 'acc-partial',
            number: 3
          })
        ])
        .catch(() => {})

      const latest = await repository.findLatestByAccreditationId('acc-partial')

      // Row 1 landed before the conflict on row 2 aborted the rest.
      // The pre-existing slot 2 remains; slot 3 is not present.
      expect(latest.number).toBe(2)
    })
  })
}
