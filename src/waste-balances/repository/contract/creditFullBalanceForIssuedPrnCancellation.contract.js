import Boom from '@hapi/boom'
import { describe, beforeEach, expect } from 'vitest'
import { STREAM_EVENT_KIND } from '../stream-schema.js'

/**
 * @typedef {object} WasteBalanceContractContext
 * @property {import('../port.js').WasteBalancesRepositoryFactory} wasteBalancesRepository
 */

export const testCreditFullBalanceForIssuedPrnCancellationBehaviour = (it) => {
  describe('creditFullBalanceForIssuedPrnCancellation', () => {
    let repository

    beforeEach(
      async (
        /** @type {WasteBalanceContractContext} */ { wasteBalancesRepository }
      ) => {
        repository = await wasteBalancesRepository()
      }
    )

    it('credits tonnage back to both amount and available balance, resolved from the stream', async ({
      seedBalance
    }) => {
      await seedBalance({
        accreditationId: 'acc-full-cancel-1',
        registrationId: 'reg-1',
        organisationId: 'org-1',
        closingBalance: { amount: 400, availableAmount: 350 }
      })

      await repository.creditFullBalanceForIssuedPrnCancellation({
        accreditationId: 'acc-full-cancel-1',
        registrationId: 'reg-1',
        organisationId: 'org-1',
        prnId: 'prn-123',
        tonnage: 60,
        createdBy: { id: 'user-abc' }
      })

      const result = await repository.findBalance({
        registrationId: 'reg-1',
        accreditationId: 'acc-full-cancel-1'
      })

      expect(result.amount).toBe(460)
      expect(result.availableAmount).toBe(410)
    })

    it('appends a PRN_CANCELLED_AFTER_ISSUE event carrying the prn and tonnage', async ({
      seedBalance,
      streamRepository
    }) => {
      await seedBalance({
        accreditationId: 'acc-full-cancel-2',
        registrationId: 'reg-1',
        organisationId: 'org-1',
        closingBalance: { amount: 100, availableAmount: 100 }
      })

      const appended =
        await repository.creditFullBalanceForIssuedPrnCancellation({
          accreditationId: 'acc-full-cancel-2',
          registrationId: 'reg-1',
          organisationId: 'org-1',
          prnId: 'prn-456',
          tonnage: 25.5,
          createdBy: { id: 'user-xyz' }
        })

      expect(appended.kind).toBe(STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE)
      expect(appended.payload).toEqual({ prnId: 'prn-456', amount: 25.5 })

      const latest = await streamRepository.findLatestByPartition(
        'reg-1',
        'acc-full-cancel-2'
      )
      expect(appended.number).toBe(latest.number)
    })

    it('throws when no balance exists', async () => {
      await expect(
        repository.creditFullBalanceForIssuedPrnCancellation({
          accreditationId: 'acc-nonexistent',
          registrationId: 'reg-1',
          organisationId: 'org-1',
          prnId: 'prn-789',
          tonnage: 10,
          createdBy: { id: 'user-123' }
        })
      ).rejects.toThrow(Boom.Boom)
    })

    it('appends the PRN event after the balance-establishing event', async ({
      seedBalance,
      streamRepository
    }) => {
      await seedBalance({
        accreditationId: 'acc-full-cancel-ledger',
        registrationId: 'reg-1',
        organisationId: 'org-1',
        closingBalance: { amount: 100, availableAmount: 100 }
      })

      const appended =
        await repository.creditFullBalanceForIssuedPrnCancellation({
          accreditationId: 'acc-full-cancel-ledger',
          registrationId: 'reg-1',
          organisationId: 'org-1',
          prnId: 'prn-ledger',
          tonnage: 10,
          createdBy: { id: 'user-abc' }
        })

      const latest = await streamRepository.findLatestByPartition(
        'reg-1',
        'acc-full-cancel-ledger'
      )
      expect(appended.number).toBe(latest.number)
      expect(appended.number).toBe(2)
    })
  })
}
