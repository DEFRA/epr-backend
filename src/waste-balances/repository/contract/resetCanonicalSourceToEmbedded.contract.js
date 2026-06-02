import { describe, beforeEach, expect } from 'vitest'

import { WASTE_BALANCE_CANONICAL_SOURCE } from '../../domain/model.js'
import { buildWasteBalance } from './test-data.js'
import { buildStreamEvent } from '../stream-test-data.js'

export const testResetCanonicalSourceToEmbeddedBehaviour = (it) => {
  describe('resetCanonicalSourceToEmbedded', () => {
    let repository

    beforeEach(
      async (
        /** @type {{ wasteBalancesRepository: import('../port.js').WasteBalancesRepositoryFactory }} */ {
          wasteBalancesRepository
        }
      ) => {
        repository = await wasteBalancesRepository()
      }
    )

    it('resets the marker from migrating back to embedded and clears migratingSince — unconditional, no version filter', async ({
      insertWasteBalance
    }) => {
      const balance = buildWasteBalance({
        accreditationId: 'acc-reset-stuck',
        version: 12,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING,
        migratingSince: '2025-01-01T00:00:00.000Z'
      })
      await insertWasteBalance(balance)

      const result = await repository.resetCanonicalSourceToEmbedded({
        accreditationId: 'acc-reset-stuck'
      })

      expect(result).toEqual({
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      })

      const after = await repository.findByAccreditationId('acc-reset-stuck')
      expect(after.canonicalSource).toBe(
        WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      )
      expect(after.migratingSince).toBeUndefined()
    })

    it('returns null when the accreditation has no balance document', async () => {
      const result = await repository.resetCanonicalSourceToEmbedded({
        accreditationId: 'acc-reset-missing'
      })

      expect(result).toBeNull()
    })

    it('returns the embedded post-state and is a no-op when the marker is already embedded', async ({
      insertWasteBalance
    }) => {
      const balance = buildWasteBalance({
        accreditationId: 'acc-reset-embedded',
        version: 4,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      })
      await insertWasteBalance(balance)

      const result = await repository.resetCanonicalSourceToEmbedded({
        accreditationId: 'acc-reset-embedded'
      })

      expect(result).toEqual({
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      })

      const after = await repository.findByAccreditationId('acc-reset-embedded')
      expect(after.canonicalSource).toBe(
        WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      )
      expect(after.migratingSince).toBeUndefined()
    })

    it('returns the ledger post-state and never demotes when the marker is already on ledger', async ({
      insertWasteBalance,
      streamRepository
    }) => {
      const balance = buildWasteBalance({
        accreditationId: 'acc-reset-ledger',
        registrationId: 'reg-1',
        version: 9,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER
      })
      await insertWasteBalance(balance)
      await streamRepository.appendEvent(
        buildStreamEvent({
          accreditationId: 'acc-reset-ledger',
          registrationId: 'reg-1',
          number: 1,
          closingBalance: { amount: 0, availableAmount: 0 }
        })
      )

      const result = await repository.resetCanonicalSourceToEmbedded({
        accreditationId: 'acc-reset-ledger'
      })

      expect(result).toEqual({
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER
      })

      const after = await repository.findByAccreditationId('acc-reset-ledger')
      expect(after.canonicalSource).toBe(WASTE_BALANCE_CANONICAL_SOURCE.LEDGER)
    })
  })
}
