import { describe, beforeEach, expect } from 'vitest'

import { buildLedgerTransaction } from '../ledger-test-data.js'

export const testDeleteAllForAccreditationIdBehaviour = (it) => {
  describe('deleteAllForAccreditationId', () => {
    let repository

    beforeEach(async ({ ledgerRepository }) => {
      repository = await ledgerRepository()
    })

    it('removes every transaction belonging to the given accreditation', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({ accreditationId: 'acc-target', number: 1 }),
        buildLedgerTransaction({ accreditationId: 'acc-target', number: 2 }),
        buildLedgerTransaction({ accreditationId: 'acc-target', number: 3 })
      ])

      await repository.deleteAllForAccreditationId('acc-target')

      const remaining =
        await repository.findLatestByAccreditationId('acc-target')
      expect(remaining).toBeNull()
    })

    it('leaves transactions for other accreditations untouched', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({ accreditationId: 'acc-target', number: 1 }),
        buildLedgerTransaction({ accreditationId: 'acc-other', number: 1 }),
        buildLedgerTransaction({ accreditationId: 'acc-other', number: 2 })
      ])

      await repository.deleteAllForAccreditationId('acc-target')

      const survivor = await repository.findLatestByAccreditationId('acc-other')
      expect(survivor).not.toBeNull()
      expect(survivor.number).toBe(2)
    })

    it('is a no-op when no transactions exist for the accreditation', async () => {
      await expect(
        repository.deleteAllForAccreditationId('acc-empty')
      ).resolves.toBeUndefined()
    })

    it('is idempotent — repeated calls are safe and remain a no-op', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({ accreditationId: 'acc-twice', number: 1 })
      ])

      await repository.deleteAllForAccreditationId('acc-twice')
      await expect(
        repository.deleteAllForAccreditationId('acc-twice')
      ).resolves.toBeUndefined()

      const remaining =
        await repository.findLatestByAccreditationId('acc-twice')
      expect(remaining).toBeNull()
    })

    it('clears the slot so subsequent inserts can reuse low numbers', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({ accreditationId: 'acc-reuse', number: 1 }),
        buildLedgerTransaction({ accreditationId: 'acc-reuse', number: 2 })
      ])

      await repository.deleteAllForAccreditationId('acc-reuse')

      await expect(
        repository.insertTransactions([
          buildLedgerTransaction({ accreditationId: 'acc-reuse', number: 1 })
        ])
      ).resolves.toBeDefined()
    })
  })
}
