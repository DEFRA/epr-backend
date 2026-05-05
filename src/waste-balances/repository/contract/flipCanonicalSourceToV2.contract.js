import { describe, beforeEach, expect } from 'vitest'

import { WASTE_BALANCE_CANONICAL_SOURCE } from '../../domain/model.js'
import { buildWasteBalance } from './test-data.js'

export const testFlipCanonicalSourceToV2Behaviour = (it) => {
  describe('flipCanonicalSourceToV2', () => {
    let repository

    beforeEach(async ({ wasteBalancesRepository }) => {
      repository = await wasteBalancesRepository()
    })

    it('flips the marker when the captured version matches', async ({
      insertWasteBalance
    }) => {
      const balance = buildWasteBalance({
        accreditationId: 'acc-flip-ok',
        version: 7,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.V1
      })
      await insertWasteBalance(balance)

      const result = await repository.flipCanonicalSourceToV2({
        accreditationId: 'acc-flip-ok',
        capturedVersion: 7
      })

      expect(result).toEqual({ flipped: true })

      const after = await repository.findByAccreditationId('acc-flip-ok')
      expect(after.canonicalSource).toBe(WASTE_BALANCE_CANONICAL_SOURCE.V2)
    })

    it('returns flipped: false and leaves the marker alone when versions diverge', async ({
      insertWasteBalance
    }) => {
      const balance = buildWasteBalance({
        accreditationId: 'acc-flip-stale',
        version: 8,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.V1
      })
      await insertWasteBalance(balance)

      const result = await repository.flipCanonicalSourceToV2({
        accreditationId: 'acc-flip-stale',
        capturedVersion: 7
      })

      expect(result).toEqual({ flipped: false })

      const after = await repository.findByAccreditationId('acc-flip-stale')
      expect(after.canonicalSource).toBe(WASTE_BALANCE_CANONICAL_SOURCE.V1)
    })

    it('returns flipped: false when the accreditation has no balance document', async () => {
      const result = await repository.flipCanonicalSourceToV2({
        accreditationId: 'acc-flip-missing',
        capturedVersion: 1
      })

      expect(result).toEqual({ flipped: false })
    })

    it('is a no-op when the marker is already v2 (filter matches accreditationId+version)', async ({
      insertWasteBalance
    }) => {
      const balance = buildWasteBalance({
        accreditationId: 'acc-flip-already-v2',
        version: 3,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.V2
      })
      await insertWasteBalance(balance)

      const result = await repository.flipCanonicalSourceToV2({
        accreditationId: 'acc-flip-already-v2',
        capturedVersion: 3
      })

      expect(result).toEqual({ flipped: true })

      const after = await repository.findByAccreditationId(
        'acc-flip-already-v2'
      )
      expect(after.canonicalSource).toBe(WASTE_BALANCE_CANONICAL_SOURCE.V2)
    })

    it('no-ops when a concurrent PRN write bumps version between capture and flip', async ({
      insertWasteBalance
    }) => {
      const accreditationId = 'acc-concurrent-prn-write'
      const balance = buildWasteBalance({
        accreditationId,
        organisationId: 'org-1',
        version: 4,
        amount: 100,
        availableAmount: 100,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.V1
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

      const result = await repository.flipCanonicalSourceToV2({
        accreditationId,
        capturedVersion
      })

      expect(result).toEqual({ flipped: false })

      const after = await repository.findByAccreditationId(accreditationId)
      expect(after.canonicalSource).toBe(WASTE_BALANCE_CANONICAL_SOURCE.V1)
      expect(after.version).toBe(capturedVersion + 1)
    })
  })
}
