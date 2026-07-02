import { describe, beforeEach, expect } from 'vitest'

import { buildStreamEvent } from '../stream-test-data.js'

/**
 * @typedef {object} StreamContractContext
 * @property {import('../stream-port.js').WasteBalanceStreamRepositoryFactory} streamRepository
 */

export const testDeleteByPartitionBehaviour = (it) => {
  describe('deleteByPartition (@migration PAE-1382)', () => {
    /** @type {import('../stream-port.js').WasteBalanceStreamRepository} */
    let repository

    beforeEach(
      async (/** @type {StreamContractContext} */ { streamRepository }) => {
        repository = await streamRepository()
      }
    )

    it('deletes all events for the given partition and returns the count', async () => {
      await repository.appendEvents([
        buildStreamEvent({
          registrationId: 'reg-del',
          accreditationId: 'acc-del',
          number: 1
        })
      ])
      await repository.appendEvents([
        buildStreamEvent({
          registrationId: 'reg-del',
          accreditationId: 'acc-del',
          number: 2,
          payload: { summaryLogId: 'log-2', creditTotal: 200 }
        })
      ])

      const count = await repository.deleteByPartition('reg-del', 'acc-del')

      expect(count).toBe(2)

      const latest = await repository.findLatestByPartition(
        'reg-del',
        'acc-del'
      )
      expect(latest).toBeNull()
    })

    it('returns 0 when the partition is empty', async () => {
      const count = await repository.deleteByPartition('reg-empty', 'acc-empty')

      expect(count).toBe(0)
    })

    it('does not affect events in other partitions', async () => {
      await repository.appendEvents([
        buildStreamEvent({
          registrationId: 'reg-keep',
          accreditationId: 'acc-keep',
          number: 1
        })
      ])
      await repository.appendEvents([
        buildStreamEvent({
          registrationId: 'reg-remove',
          accreditationId: 'acc-remove',
          number: 1
        })
      ])

      await repository.deleteByPartition('reg-remove', 'acc-remove')

      const kept = await repository.findLatestByPartition(
        'reg-keep',
        'acc-keep'
      )
      expect(kept).not.toBeNull()
      expect(kept?.registrationId).toBe('reg-keep')
    })

    it("deletes one accreditation's partition without touching the same registration's registered-only stream", async () => {
      await repository.appendEvents([
        buildStreamEvent({
          registrationId: 'reg-shared',
          accreditationId: 'acc-1',
          number: 1
        })
      ])
      await repository.appendEvents([
        buildStreamEvent({
          registrationId: 'reg-shared',
          accreditationId: null,
          number: 1,
          payload: { summaryLogId: 'reg-only-log', creditTotal: 0 },
          closingBalance: { amount: 0, availableAmount: 0 }
        })
      ])

      const count = await repository.deleteByPartition('reg-shared', 'acc-1')

      expect(count).toBe(1)

      const accreditationStream = await repository.findLatestByPartition(
        'reg-shared',
        'acc-1'
      )
      expect(accreditationStream).toBeNull()

      const registeredOnlyStream = await repository.findLatestByPartition(
        'reg-shared',
        null
      )
      expect(registeredOnlyStream).not.toBeNull()
      expect(registeredOnlyStream?.accreditationId).toBeNull()
    })
  })
}
