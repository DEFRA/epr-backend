import { describe, beforeEach, expect } from 'vitest'

import { WASTE_BALANCE_CANONICAL_SOURCE } from '../../domain/model.js'
import { buildWasteBalance } from './test-data.js'

export const testFlipCanonicalSourceToLedgerBehaviour = (it) => {
  describe('flipCanonicalSourceToLedger', () => {
    let repository

    beforeEach(async ({ wasteBalancesRepository }) => {
      repository = await wasteBalancesRepository()
    })

    it('flips the marker from migrating to ledger when the captured version matches and clears migratingSince', async ({
      insertWasteBalance
    }) => {
      const balance = buildWasteBalance({
        accreditationId: 'acc-flip-ok',
        version: 7,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING,
        migratingSince: '2025-01-01T00:00:00.000Z'
      })
      await insertWasteBalance(balance)

      const result = await repository.flipCanonicalSourceToLedger({
        accreditationId: 'acc-flip-ok',
        capturedVersion: 7
      })

      expect(result).toEqual({
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER
      })

      const after = await repository.findByAccreditationId('acc-flip-ok')
      expect(after.canonicalSource).toBe(WASTE_BALANCE_CANONICAL_SOURCE.LEDGER)
      expect(after.migratingSince).toBeUndefined()
    })

    it('returns the migrating post-state and leaves the marker alone when versions diverge', async ({
      insertWasteBalance
    }) => {
      const existingMigratingSince = '2025-01-01T00:00:00.000Z'
      const balance = buildWasteBalance({
        accreditationId: 'acc-flip-stale',
        version: 8,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING,
        migratingSince: existingMigratingSince
      })
      await insertWasteBalance(balance)

      const result = await repository.flipCanonicalSourceToLedger({
        accreditationId: 'acc-flip-stale',
        capturedVersion: 7
      })

      expect(result).toEqual({
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING
      })

      const after = await repository.findByAccreditationId('acc-flip-stale')
      expect(after.canonicalSource).toBe(
        WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING
      )
      expect(after.migratingSince).toBe(existingMigratingSince)
    })

    it('returns null when the accreditation has no balance document', async () => {
      const result = await repository.flipCanonicalSourceToLedger({
        accreditationId: 'acc-flip-missing',
        capturedVersion: 1
      })

      expect(result).toBeNull()
    })

    it('returns the ledger post-state when the marker is already on ledger — only promotes migrating', async ({
      insertWasteBalance
    }) => {
      const balance = buildWasteBalance({
        accreditationId: 'acc-flip-already-ledger',
        version: 3,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER
      })
      await insertWasteBalance(balance)

      const result = await repository.flipCanonicalSourceToLedger({
        accreditationId: 'acc-flip-already-ledger',
        capturedVersion: 3
      })

      expect(result).toEqual({
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER
      })

      const after = await repository.findByAccreditationId(
        'acc-flip-already-ledger'
      )
      expect(after.canonicalSource).toBe(WASTE_BALANCE_CANONICAL_SOURCE.LEDGER)
    })

    it('returns the embedded post-state and leaves the marker alone when called before the migrating step — only promotes migrating', async ({
      insertWasteBalance
    }) => {
      const balance = buildWasteBalance({
        accreditationId: 'acc-flip-still-embedded',
        version: 2,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      })
      await insertWasteBalance(balance)

      const result = await repository.flipCanonicalSourceToLedger({
        accreditationId: 'acc-flip-still-embedded',
        capturedVersion: 2
      })

      expect(result).toEqual({
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      })

      const after = await repository.findByAccreditationId(
        'acc-flip-still-embedded'
      )
      expect(after.canonicalSource).toBe(
        WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      )
    })

    it('returns migrating post-state when a concurrent PRN write bumps version between capture and flip', async ({
      insertWasteBalance
    }) => {
      const accreditationId = 'acc-concurrent-prn-write'
      const existingMigratingSince = '2025-01-01T00:00:00.000Z'
      const balance = buildWasteBalance({
        accreditationId,
        organisationId: 'org-1',
        version: 4,
        amount: 100,
        availableAmount: 100,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING,
        migratingSince: existingMigratingSince
      })
      await insertWasteBalance(balance)

      const beforeFlip = await repository.findByAccreditationId(accreditationId)
      const capturedVersion = beforeFlip.version

      await repository.deductTotalBalanceForPrnIssue({
        accreditationId,
        organisationId: 'org-1',
        prnId: 'prn-during-rebuild',
        tonnage: 5,
        userId: 'user-1'
      })

      const result = await repository.flipCanonicalSourceToLedger({
        accreditationId,
        capturedVersion
      })

      expect(result).toEqual({
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING
      })

      const after = await repository.findByAccreditationId(accreditationId)
      expect(after.canonicalSource).toBe(
        WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING
      )
      expect(after.version).toBe(capturedVersion + 1)
      expect(after.migratingSince).toBe(existingMigratingSince)
    })
  })
}
