import { describe, beforeEach, expect } from 'vitest'
import { STREAM_EVENT_KIND, ZERO_BALANCE } from '../stream-schema.js'

/**
 * @typedef {object} WasteBalanceContractContext
 * @property {import('../port.js').WasteBalancesRepositoryFactory} wasteBalancesRepository
 */

export const testAppendRegisteredOnlySubmittedEventBehaviour = (it) => {
  describe('appendRegisteredOnlySubmittedEvent', () => {
    let repository

    beforeEach(
      async (
        /** @type {WasteBalanceContractContext} */ { wasteBalancesRepository }
      ) => {
        repository = await wasteBalancesRepository()
      }
    )

    it('appends a zero-delta summary-log submitted event into the null-accreditation partition', async ({
      streamRepository
    }) => {
      const createdBy = {
        id: 'user-abc',
        name: 'Ada Lovelace',
        email: 'ada@example.com'
      }

      const appended = await repository.appendRegisteredOnlySubmittedEvent({
        registrationId: 'reg-1',
        organisationId: 'org-1',
        summaryLogId: 'log-1',
        createdBy
      })

      expect(appended.kind).toBe(STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED)
      expect(appended.accreditationId).toBeNull()
      expect(appended.payload).toEqual({
        summaryLogId: 'log-1',
        creditTotal: 0
      })
      expect(appended.closingBalance).toEqual(ZERO_BALANCE)
      expect(appended.createdBy).toEqual(createdBy)

      const latest = await streamRepository.findLatestByPartition('reg-1', null)
      expect(latest.payload).toEqual({ summaryLogId: 'log-1', creditTotal: 0 })
    })
  })
}
