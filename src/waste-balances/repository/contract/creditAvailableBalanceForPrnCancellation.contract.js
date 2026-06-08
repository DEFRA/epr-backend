import Boom from '@hapi/boom'
import { describe, beforeEach, expect } from 'vitest'
import { buildWasteBalance } from './test-data.js'
import { buildStreamEvent } from '../stream-test-data.js'
import { STREAM_EVENT_KIND } from '../stream-schema.js'

/**
 * @typedef {object} WasteBalanceContractContext
 * @property {import('../port.js').WasteBalancesRepositoryFactory} wasteBalancesRepository
 */

export const testCreditAvailableBalanceForPrnCancellationBehaviour = (it) => {
  describe('creditAvailableBalanceForPrnCancellation', () => {
    let repository

    beforeEach(
      async (
        /** @type {WasteBalanceContractContext} */ { wasteBalancesRepository }
      ) => {
        repository = await wasteBalancesRepository()
      }
    )

    it('credits tonnage back to available balance only, resolved from the stream', async ({
      insertWasteBalance,
      streamRepository
    }) => {
      const wasteBalance = buildWasteBalance({
        accreditationId: 'acc-cancel-1',
        registrationId: 'reg-1',
        organisationId: 'org-1'
      })

      await insertWasteBalance(wasteBalance)
      await streamRepository.appendEvent(
        buildStreamEvent({
          accreditationId: 'acc-cancel-1',
          registrationId: 'reg-1',
          number: 1,
          closingBalance: { amount: 500, availableAmount: 350 }
        })
      )

      await repository.creditAvailableBalanceForPrnCancellation({
        accreditationId: 'acc-cancel-1',
        registrationId: 'reg-1',
        organisationId: 'org-1',
        prnId: 'prn-123',
        tonnage: 50,
        createdBy: { id: 'user-abc' }
      })

      const result = await repository.findByAccreditationId('acc-cancel-1')

      expect(result.amount).toBe(500)
      expect(result.availableAmount).toBe(400)
    })

    it('appends a PRN_CREATION_CANCELLED event carrying the prn and tonnage', async ({
      insertWasteBalance,
      streamRepository
    }) => {
      const wasteBalance = buildWasteBalance({
        accreditationId: 'acc-cancel-2',
        registrationId: 'reg-1',
        organisationId: 'org-1'
      })

      await insertWasteBalance(wasteBalance)

      const appended =
        await repository.creditAvailableBalanceForPrnCancellation({
          accreditationId: 'acc-cancel-2',
          registrationId: 'reg-1',
          organisationId: 'org-1',
          prnId: 'prn-456',
          tonnage: 25.5,
          createdBy: { id: 'user-xyz' }
        })

      expect(appended.kind).toBe(STREAM_EVENT_KIND.PRN_CREATION_CANCELLED)
      expect(appended.payload).toEqual({ prnId: 'prn-456', amount: 25.5 })

      const latest = await streamRepository.findLatestByPartition(
        'reg-1',
        'acc-cancel-2'
      )
      expect(appended.number).toBe(latest.number)
    })

    it('throws when no balance exists', async () => {
      await expect(
        repository.creditAvailableBalanceForPrnCancellation({
          accreditationId: 'acc-nonexistent',
          registrationId: 'reg-1',
          organisationId: 'org-1',
          prnId: 'prn-789',
          tonnage: 10,
          createdBy: { id: 'user-123' }
        })
      ).rejects.toThrow(Boom.Boom)
    })

    it('returns the appended stream event', async ({
      insertWasteBalance,
      streamRepository
    }) => {
      const wasteBalance = buildWasteBalance({
        accreditationId: 'acc-cancel-ledger',
        registrationId: 'reg-1',
        organisationId: 'org-1'
      })

      await insertWasteBalance(wasteBalance)

      const appended =
        await repository.creditAvailableBalanceForPrnCancellation({
          accreditationId: 'acc-cancel-ledger',
          registrationId: 'reg-1',
          organisationId: 'org-1',
          prnId: 'prn-ledger',
          tonnage: 10,
          createdBy: { id: 'user-abc' }
        })

      const latest = await streamRepository.findLatestByPartition(
        'reg-1',
        'acc-cancel-ledger'
      )
      expect(appended.number).toBe(latest.number)
      expect(appended.number).toBe(1)
    })
  })
}
