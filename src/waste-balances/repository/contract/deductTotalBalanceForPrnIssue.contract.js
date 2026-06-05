import { describe, beforeEach, expect } from 'vitest'
import { buildWasteBalance } from './test-data.js'
import { buildStreamEvent } from '../stream-test-data.js'
import { STREAM_EVENT_KIND } from '../stream-schema.js'

/**
 * @typedef {object} WasteBalanceContractContext
 * @property {import('../port.js').WasteBalancesRepositoryFactory} wasteBalancesRepository
 */

export const testDeductTotalBalanceForPrnIssueBehaviour = (it) => {
  describe('deductTotalBalanceForPrnIssue', () => {
    let repository

    beforeEach(
      async (
        /** @type {WasteBalanceContractContext} */ { wasteBalancesRepository }
      ) => {
        repository = await wasteBalancesRepository()
      }
    )

    it('deducts tonnage from total balance only, resolved from the stream', async ({
      insertWasteBalance,
      streamRepository
    }) => {
      // Available was already deducted when the PRN was created; issuing
      // deducts from the total amount.
      const wasteBalance = buildWasteBalance({
        accreditationId: 'acc-issue-1',
        registrationId: 'reg-1',
        organisationId: 'org-1'
      })

      await insertWasteBalance(wasteBalance)
      await streamRepository.appendEvent(
        buildStreamEvent({
          accreditationId: 'acc-issue-1',
          registrationId: 'reg-1',
          number: 1,
          closingBalance: { amount: 500, availableAmount: 450 }
        })
      )

      await repository.deductTotalBalanceForPrnIssue({
        accreditationId: 'acc-issue-1',
        registrationId: 'reg-1',
        organisationId: 'org-1',
        prnId: 'prn-123',
        tonnage: 50,
        createdBy: { id: 'user-abc' }
      })

      const result = await repository.findByAccreditationId('acc-issue-1')

      expect(result.amount).toBe(450) // Total deducted
      expect(result.availableAmount).toBe(450) // Available unchanged
    })

    it('appends a PRN_ISSUED event carrying the prn and tonnage', async ({
      insertWasteBalance,
      streamRepository
    }) => {
      const wasteBalance = buildWasteBalance({
        accreditationId: 'acc-issue-2',
        registrationId: 'reg-1',
        organisationId: 'org-1'
      })

      await insertWasteBalance(wasteBalance)

      const appended = await repository.deductTotalBalanceForPrnIssue({
        accreditationId: 'acc-issue-2',
        registrationId: 'reg-1',
        organisationId: 'org-1',
        prnId: 'prn-456',
        tonnage: 25.5,
        createdBy: { id: 'user-xyz' }
      })

      expect(appended.kind).toBe(STREAM_EVENT_KIND.PRN_ISSUED)
      expect(appended.payload).toEqual({ prnId: 'prn-456', amount: 25.5 })

      const latest = await streamRepository.findLatestByPartition(
        'reg-1',
        'acc-issue-2'
      )
      expect(appended.number).toBe(latest.number)
    })

    it('does nothing and returns null when no balance exists', async () => {
      const appended = await repository.deductTotalBalanceForPrnIssue({
        accreditationId: 'acc-nonexistent',
        registrationId: 'reg-1',
        organisationId: 'org-1',
        prnId: 'prn-999',
        tonnage: 10,
        createdBy: { id: 'user-456' }
      })

      expect(appended).toBeNull()

      const result = await repository.findByAccreditationId('acc-nonexistent')
      expect(result).toBeNull()
    })

    it('returns the appended stream event', async ({
      insertWasteBalance,
      streamRepository
    }) => {
      const wasteBalance = buildWasteBalance({
        accreditationId: 'acc-issue-ledger',
        registrationId: 'reg-1',
        organisationId: 'org-1'
      })

      await insertWasteBalance(wasteBalance)

      const appended = await repository.deductTotalBalanceForPrnIssue({
        accreditationId: 'acc-issue-ledger',
        registrationId: 'reg-1',
        organisationId: 'org-1',
        prnId: 'prn-ledger',
        tonnage: 10,
        createdBy: { id: 'user-abc' }
      })

      const latest = await streamRepository.findLatestByPartition(
        'reg-1',
        'acc-issue-ledger'
      )
      expect(appended.number).toBe(latest.number)
      expect(appended.number).toBe(1)
    })
  })
}
