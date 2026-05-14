import { describe, beforeEach, expect } from 'vitest'

import { buildStreamEvent } from '../stream-test-data.js'

export const testFindLatestByPartitionBehaviour = (it) => {
  describe('findLatestByPartition', () => {
    let repository

    beforeEach(async ({ streamRepository }) => {
      repository = await streamRepository()
    })

    it('returns null when no events exist for the partition', async () => {
      const result = await repository.findLatestByPartition(
        'reg-empty',
        'acc-empty'
      )
      expect(result).toBeNull()
    })

    it('returns the only event when one exists', async () => {
      const stored = await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-single',
          accreditationId: 'acc-single',
          number: 1,
          closingBalance: { amount: 50, availableAmount: 40 }
        })
      )

      const result = await repository.findLatestByPartition(
        'reg-single',
        'acc-single'
      )

      expect(result).not.toBeNull()
      expect(result.id).toBe(stored.id)
      expect(result.number).toBe(1)
      expect(result.closingBalance).toEqual({ amount: 50, availableAmount: 40 })
    })

    it('returns the highest-numbered event when many exist', async () => {
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-many',
          accreditationId: 'acc-many',
          number: 1,
          payload: { summaryLogId: 'log-1', creditTotal: 100 },
          closingBalance: { amount: 10, availableAmount: 10 }
        })
      )
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-many',
          accreditationId: 'acc-many',
          number: 3,
          payload: { summaryLogId: 'log-3', creditTotal: 300 },
          closingBalance: { amount: 30, availableAmount: 25 }
        })
      )
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-many',
          accreditationId: 'acc-many',
          number: 2,
          payload: { summaryLogId: 'log-2', creditTotal: 200 },
          closingBalance: { amount: 20, availableAmount: 18 }
        })
      )

      const result = await repository.findLatestByPartition(
        'reg-many',
        'acc-many'
      )

      expect(result.number).toBe(3)
      expect(result.closingBalance).toEqual({ amount: 30, availableAmount: 25 })
    })

    it('isolates results by partition', async () => {
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-x',
          accreditationId: 'acc-x',
          number: 1
        })
      )
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-y',
          accreditationId: 'acc-y',
          number: 5,
          payload: { summaryLogId: 'log-5', creditTotal: 500 }
        })
      )

      const x = await repository.findLatestByPartition('reg-x', 'acc-x')
      const y = await repository.findLatestByPartition('reg-y', 'acc-y')

      expect(x.number).toBe(1)
      expect(y.number).toBe(5)
    })

    it('treats null and non-null accreditationId as separate streams', async () => {
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-null-test',
          accreditationId: null,
          number: 1,
          closingBalance: { amount: 0, availableAmount: 0 }
        })
      )
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-null-test',
          accreditationId: 'acc-non-null',
          number: 1,
          closingBalance: { amount: 999, availableAmount: 999 }
        })
      )

      const nullStream = await repository.findLatestByPartition(
        'reg-null-test',
        null
      )
      const nonNullStream = await repository.findLatestByPartition(
        'reg-null-test',
        'acc-non-null'
      )

      expect(nullStream.closingBalance).toEqual({
        amount: 0,
        availableAmount: 0
      })
      expect(nonNullStream.closingBalance).toEqual({
        amount: 999,
        availableAmount: 999
      })
    })

    it('round-trips high-precision amounts exactly', async () => {
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-precision',
          accreditationId: 'acc-precision',
          number: 1,
          payload: { summaryLogId: 'log-precise', creditTotal: 200.005 },
          openingBalance: { amount: 0, availableAmount: 0 },
          closingBalance: { amount: 200.005, availableAmount: 200.005 }
        })
      )

      const result = await repository.findLatestByPartition(
        'reg-precision',
        'acc-precision'
      )

      expect(result.closingBalance.amount).toBe(200.005)
      expect(result.closingBalance.availableAmount).toBe(200.005)
      expect(result.payload.creditTotal).toBe(200.005)
    })
  })
}
