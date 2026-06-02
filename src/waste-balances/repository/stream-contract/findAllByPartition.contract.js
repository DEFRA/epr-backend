import { describe, beforeEach, expect } from 'vitest'

import { buildStreamEvent } from '../stream-test-data.js'

export const testFindAllByPartitionBehaviour = (it) => {
  describe('findAllByPartition', () => {
    let repository

    beforeEach(
      async (
        /** @type {{ streamRepository: import('../stream-port.js').WasteBalanceStreamRepositoryFactory }} */ {
          streamRepository
        }
      ) => {
        repository = await streamRepository()
      }
    )

    it('returns an empty array when no events exist for the partition', async () => {
      const result = await repository.findAllByPartition(
        'reg-empty',
        'acc-empty'
      )
      expect(result).toEqual([])
    })

    it('returns all events ordered by number ascending', async () => {
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-all',
          accreditationId: 'acc-all',
          number: 1,
          closingBalance: { amount: 10, availableAmount: 10 }
        })
      )
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-all',
          accreditationId: 'acc-all',
          number: 2,
          closingBalance: { amount: 20, availableAmount: 18 }
        })
      )
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-all',
          accreditationId: 'acc-all',
          number: 3,
          closingBalance: { amount: 30, availableAmount: 25 }
        })
      )

      const result = await repository.findAllByPartition('reg-all', 'acc-all')

      expect(result).toHaveLength(3)
      expect(result[0].number).toBe(1)
      expect(result[1].number).toBe(2)
      expect(result[2].number).toBe(3)
    })

    it('does not return events from a different partition', async () => {
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-a',
          accreditationId: 'acc-a',
          number: 1
        })
      )
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-b',
          accreditationId: 'acc-b',
          number: 1
        })
      )

      const result = await repository.findAllByPartition('reg-a', 'acc-a')

      expect(result).toHaveLength(1)
      expect(result[0].registrationId).toBe('reg-a')
      expect(result[0].accreditationId).toBe('acc-a')
    })
  })
}
