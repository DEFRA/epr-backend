import { describe, beforeEach, expect } from 'vitest'

import { buildStreamEvent } from '../stream-test-data.js'

export const testDeleteByPartitionBehaviour = (it) => {
  describe('deleteByPartition (@migration PAE-1382)', () => {
    let repository

    beforeEach(async ({ streamRepository }) => {
      repository = await streamRepository()
    })

    it('deletes all events for the given partition and returns the count', async () => {
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-del',
          accreditationId: 'acc-del',
          number: 1
        })
      )
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-del',
          accreditationId: 'acc-del',
          number: 2,
          payload: { summaryLogId: 'log-2', creditTotal: 200 }
        })
      )

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
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-keep',
          accreditationId: 'acc-keep',
          number: 1
        })
      )
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-remove',
          accreditationId: 'acc-remove',
          number: 1
        })
      )

      await repository.deleteByPartition('reg-remove', 'acc-remove')

      const kept = await repository.findLatestByPartition(
        'reg-keep',
        'acc-keep'
      )
      expect(kept).not.toBeNull()
      expect(kept.registrationId).toBe('reg-keep')
    })
  })
}
