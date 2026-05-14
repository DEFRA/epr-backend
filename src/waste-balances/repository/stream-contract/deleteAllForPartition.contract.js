import { describe, beforeEach, expect } from 'vitest'

import { buildStreamEvent } from '../stream-test-data.js'

export const testDeleteAllForPartitionBehaviour = (it) => {
  describe('deleteAllForPartition', () => {
    let repository

    beforeEach(async ({ streamRepository }) => {
      repository = await streamRepository()
    })

    it('removes every event belonging to the given partition', async () => {
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-target',
          accreditationId: 'acc-target',
          number: 1,
          payload: { summaryLogId: 'log-1', creditTotal: 100 }
        })
      )
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-target',
          accreditationId: 'acc-target',
          number: 2,
          payload: { summaryLogId: 'log-2', creditTotal: 200 }
        })
      )

      await repository.deleteAllForPartition('reg-target', 'acc-target')

      const remaining = await repository.findLatestByPartition(
        'reg-target',
        'acc-target'
      )
      expect(remaining).toBeNull()
    })

    it('leaves events for other partitions untouched', async () => {
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-target',
          accreditationId: 'acc-target',
          number: 1
        })
      )
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-other',
          accreditationId: 'acc-other',
          number: 1
        })
      )

      await repository.deleteAllForPartition('reg-target', 'acc-target')

      const survivor = await repository.findLatestByPartition(
        'reg-other',
        'acc-other'
      )
      expect(survivor).not.toBeNull()
      expect(survivor.number).toBe(1)
    })

    it('is a no-op when no events exist for the partition', async () => {
      await expect(
        repository.deleteAllForPartition('reg-empty', 'acc-empty')
      ).resolves.toBeUndefined()
    })

    it('is idempotent — repeated calls are safe', async () => {
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-twice',
          accreditationId: 'acc-twice',
          number: 1
        })
      )

      await repository.deleteAllForPartition('reg-twice', 'acc-twice')
      await expect(
        repository.deleteAllForPartition('reg-twice', 'acc-twice')
      ).resolves.toBeUndefined()
    })

    it('clears the slot so subsequent inserts can reuse low numbers', async () => {
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-reuse',
          accreditationId: 'acc-reuse',
          number: 1
        })
      )

      await repository.deleteAllForPartition('reg-reuse', 'acc-reuse')

      await expect(
        repository.appendEvent(
          buildStreamEvent({
            registrationId: 'reg-reuse',
            accreditationId: 'acc-reuse',
            number: 1
          })
        )
      ).resolves.toBeDefined()
    })
  })
}
