import { describe, beforeEach, expect } from 'vitest'
import { buildWasteBalance } from './test-data.js'
import { WASTE_BALANCE_CANONICAL_SOURCE } from '../../domain/model.js'
import { STREAM_EVENT_KIND } from '../stream-schema.js'

export const testAppendStreamEventBehaviour = (it) => {
  describe('appendStreamEvent', () => {
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

    it('appends a status-only stream event on the ledger path', async ({
      insertWasteBalance,
      streamRepository
    }) => {
      const wasteBalance = buildWasteBalance({
        accreditationId: 'acc-append-1',
        registrationId: 'reg-1',
        organisationId: 'org-1',
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER
      })

      await insertWasteBalance(wasteBalance)

      const appended = await repository.appendStreamEvent({
        accreditationId: 'acc-append-1',
        registrationId: 'reg-1',
        organisationId: 'org-1',
        prnId: 'prn-1',
        tonnage: 10,
        userId: 'user-abc',
        streamKind: STREAM_EVENT_KIND.PRN_ACCEPTED
      })

      const latest = await streamRepository.findLatestByPartition(
        'reg-1',
        'acc-append-1'
      )
      expect(appended.number).toBe(latest.number)
      expect(appended.kind).toBe(STREAM_EVENT_KIND.PRN_ACCEPTED)
      expect(appended.payload).toEqual({ prnId: 'prn-1', amount: 10 })
    })

    it('throws on the embedded path', async ({ insertWasteBalance }) => {
      const wasteBalance = buildWasteBalance({
        accreditationId: 'acc-append-embedded',
        organisationId: 'org-1'
      })

      await insertWasteBalance(wasteBalance)

      await expect(
        repository.appendStreamEvent({
          accreditationId: 'acc-append-embedded',
          registrationId: 'reg-1',
          organisationId: 'org-1',
          prnId: 'prn-2',
          tonnage: 10,
          userId: 'user-abc',
          streamKind: STREAM_EVENT_KIND.PRN_REJECTED
        })
      ).rejects.toThrow(/ledger-only/)
    })

    it('throws when no balance exists', async () => {
      await expect(
        repository.appendStreamEvent({
          accreditationId: 'acc-append-missing',
          registrationId: 'reg-1',
          organisationId: 'org-1',
          prnId: 'prn-3',
          tonnage: 10,
          userId: 'user-abc',
          streamKind: STREAM_EVENT_KIND.PRN_ACCEPTED
        })
      ).rejects.toThrow(/ledger-only/)
    })
  })
}
