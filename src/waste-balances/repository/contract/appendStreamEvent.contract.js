import { describe, beforeEach, expect } from 'vitest'
import { STREAM_EVENT_KIND } from '../stream-schema.js'

/**
 * @typedef {object} WasteBalanceContractContext
 * @property {import('../port.js').WasteBalancesRepositoryFactory} wasteBalancesRepository
 */

export const testAppendStreamEventBehaviour = (it) => {
  describe('appendStreamEvent', () => {
    let repository

    beforeEach(
      async (
        /** @type {WasteBalanceContractContext} */ { wasteBalancesRepository }
      ) => {
        repository = await wasteBalancesRepository()
      }
    )

    it('appends a status-only stream event when a balance exists', async ({
      seedBalance,
      streamRepository
    }) => {
      await seedBalance({
        accreditationId: 'acc-append-1',
        registrationId: 'reg-1',
        organisationId: 'org-1',
        closingBalance: { amount: 100, availableAmount: 100 }
      })

      const createdBy = {
        id: 'user-abc',
        name: 'Ada Lovelace',
        email: 'ada@example.com'
      }

      const appended = await repository.appendStreamEvent({
        accreditationId: 'acc-append-1',
        registrationId: 'reg-1',
        organisationId: 'org-1',
        prnId: 'prn-1',
        tonnage: 10,
        createdBy,
        streamKind: STREAM_EVENT_KIND.PRN_ACCEPTED
      })

      const latest = await streamRepository.findLatestByPartition(
        'reg-1',
        'acc-append-1'
      )
      expect(appended.number).toBe(latest.number)
      expect(appended.kind).toBe(STREAM_EVENT_KIND.PRN_ACCEPTED)
      expect(appended.payload).toEqual({ prnId: 'prn-1', amount: 10 })
      expect(appended.createdBy).toEqual(createdBy)
      expect(latest.createdBy).toEqual(createdBy)
    })

    it('throws when no balance exists', async () => {
      await expect(
        repository.appendStreamEvent({
          accreditationId: 'acc-append-missing',
          registrationId: 'reg-1',
          organisationId: 'org-1',
          prnId: 'prn-3',
          tonnage: 10,
          createdBy: { id: 'user-abc' },
          streamKind: STREAM_EVENT_KIND.PRN_ACCEPTED
        })
      ).rejects.toThrow(/stream-backed balance/)
    })
  })
}
