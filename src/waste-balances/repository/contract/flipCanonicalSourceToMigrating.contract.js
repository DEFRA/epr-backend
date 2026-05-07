import { describe, beforeEach, expect } from 'vitest'

import { WASTE_BALANCE_CANONICAL_SOURCE } from '../../domain/model.js'
import { buildWasteBalance } from './test-data.js'
import { buildLedgerTransaction } from '../ledger-test-data.js'

export const testFlipCanonicalSourceToMigratingBehaviour = (it) => {
  describe('flipCanonicalSourceToMigrating', () => {
    let repository

    beforeEach(async ({ wasteBalancesRepository }) => {
      repository = await wasteBalancesRepository()
    })

    it('flips the marker from embedded to migrating when the captured version matches and stamps migratingSince', async ({
      insertWasteBalance
    }) => {
      const balance = buildWasteBalance({
        accreditationId: 'acc-flip-migrating-ok',
        version: 7,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      })
      await insertWasteBalance(balance)

      const beforeFlipAt = Date.now()
      const result = await repository.flipCanonicalSourceToMigrating({
        accreditationId: 'acc-flip-migrating-ok',
        capturedVersion: 7
      })
      const afterFlipAt = Date.now()

      expect(result).toEqual({
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING
      })

      const after = await repository.findByAccreditationId(
        'acc-flip-migrating-ok'
      )
      expect(after.canonicalSource).toBe(
        WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING
      )
      expect(after.migratingSince).toBeDefined()
      const migratingAt = new Date(after.migratingSince).getTime()
      expect(migratingAt).toBeGreaterThanOrEqual(beforeFlipAt)
      expect(migratingAt).toBeLessThanOrEqual(afterFlipAt)
    })

    it('returns the embedded post-state and leaves the marker alone when versions diverge', async ({
      insertWasteBalance
    }) => {
      const balance = buildWasteBalance({
        accreditationId: 'acc-flip-migrating-stale',
        version: 8,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      })
      await insertWasteBalance(balance)

      const result = await repository.flipCanonicalSourceToMigrating({
        accreditationId: 'acc-flip-migrating-stale',
        capturedVersion: 7
      })

      expect(result).toEqual({
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      })

      const after = await repository.findByAccreditationId(
        'acc-flip-migrating-stale'
      )
      expect(after.canonicalSource).toBe(
        WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      )
      expect(after.migratingSince).toBeUndefined()
    })

    it('returns null when the accreditation has no balance document', async () => {
      const result = await repository.flipCanonicalSourceToMigrating({
        accreditationId: 'acc-flip-migrating-missing',
        capturedVersion: 1
      })

      expect(result).toBeNull()
    })

    it('returns the migrating post-state and leaves migratingSince alone when already migrating — only promotes embedded', async ({
      insertWasteBalance
    }) => {
      const existingMigratingSince = '2025-01-01T00:00:00.000Z'
      const balance = buildWasteBalance({
        accreditationId: 'acc-flip-migrating-already',
        version: 3,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING,
        migratingSince: existingMigratingSince
      })
      await insertWasteBalance(balance)

      const result = await repository.flipCanonicalSourceToMigrating({
        accreditationId: 'acc-flip-migrating-already',
        capturedVersion: 3
      })

      expect(result).toEqual({
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING
      })

      const after = await repository.findByAccreditationId(
        'acc-flip-migrating-already'
      )
      expect(after.canonicalSource).toBe(
        WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING
      )
      expect(after.migratingSince).toBe(existingMigratingSince)
    })

    it('returns the ledger post-state and never demotes when the marker is already on ledger', async ({
      insertWasteBalance,
      ledgerRepository
    }) => {
      const balance = buildWasteBalance({
        accreditationId: 'acc-flip-migrating-ledger',
        version: 5,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER
      })
      await insertWasteBalance(balance)
      await ledgerRepository.insertTransactions([
        buildLedgerTransaction({
          accreditationId: 'acc-flip-migrating-ledger',
          number: 1,
          closingBalance: { amount: 0, availableAmount: 0 }
        })
      ])

      const result = await repository.flipCanonicalSourceToMigrating({
        accreditationId: 'acc-flip-migrating-ledger',
        capturedVersion: 5
      })

      expect(result).toEqual({
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER
      })

      const after = await repository.findByAccreditationId(
        'acc-flip-migrating-ledger'
      )
      expect(after.canonicalSource).toBe(WASTE_BALANCE_CANONICAL_SOURCE.LEDGER)
      expect(after.migratingSince).toBeUndefined()
    })

    it('returns embedded post-state when a concurrent PRN write bumps version between capture and flip', async ({
      insertWasteBalance
    }) => {
      const accreditationId = 'acc-concurrent-prn-write-migrating'
      const balance = buildWasteBalance({
        accreditationId,
        organisationId: 'org-1',
        version: 4,
        amount: 100,
        availableAmount: 100,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      })
      await insertWasteBalance(balance)

      const beforeFlip = await repository.findByAccreditationId(accreditationId)
      const capturedVersion = beforeFlip.version

      await repository.deductTotalBalanceForPrnIssue({
        accreditationId,
        organisationId: 'org-1',
        prnId: 'prn-during-rebuild',
        tonnage: 5,
        user: { id: 'user-1', email: 'user-1@example.com' }
      })

      const result = await repository.flipCanonicalSourceToMigrating({
        accreditationId,
        capturedVersion
      })

      expect(result).toEqual({
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      })

      const after = await repository.findByAccreditationId(accreditationId)
      expect(after.canonicalSource).toBe(
        WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      )
      expect(after.version).toBe(capturedVersion + 1)
      expect(after.migratingSince).toBeUndefined()
    })
  })
}
