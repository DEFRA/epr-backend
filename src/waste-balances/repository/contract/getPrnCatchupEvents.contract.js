import { describe, beforeEach, expect } from 'vitest'

import { STREAM_EVENT_KIND } from '../stream-schema.js'
import { buildWasteBalance } from './test-data.js'
import {
  buildPrnCreatedEvent,
  buildPrnIssuedEvent
} from '../stream-test-data.js'

const PRN_ID = 'prn-catchup'

const partition = (suffix) => ({
  registrationId: `reg-catchup-${suffix}`,
  accreditationId: `acc-catchup-${suffix}`
})

const balance = (suffix) => buildWasteBalance(partition(suffix))

const params = ({ suffix, afterEventNumber = 0 }) => ({
  ...partition(suffix),
  prnId: PRN_ID,
  afterEventNumber
})

export const testGetPrnCatchupEventsBehaviour = (it) => {
  describe('getPrnCatchupEvents', () => {
    let repository

    beforeEach(async ({ wasteBalancesRepository }) => {
      repository = await wasteBalancesRepository()
    })

    it('returns an empty array when no balance document exists', async () => {
      const result = await repository.getPrnCatchupEvents(
        params({ suffix: 'missing' })
      )

      expect(result).toEqual([])
    })

    it('returns an empty array when there are no matching tail events', async ({
      insertWasteBalance,
      streamRepository
    }) => {
      const suffix = 'no-tail'
      await insertWasteBalance(balance(suffix))
      await streamRepository.appendEvent(
        buildPrnCreatedEvent({
          ...partition(suffix),
          number: 1,
          payload: { prnId: 'other-prn', amount: 10 }
        })
      )

      const result = await repository.getPrnCatchupEvents(params({ suffix }))

      expect(result).toEqual([])
    })

    it('returns tail events when events exist for the PRN', async ({
      insertWasteBalance,
      streamRepository
    }) => {
      const suffix = 'tail'
      await insertWasteBalance(balance(suffix))
      await streamRepository.appendEvent(
        buildPrnCreatedEvent({
          ...partition(suffix),
          number: 1,
          payload: { prnId: PRN_ID, amount: 10 }
        })
      )
      await streamRepository.appendEvent(
        buildPrnIssuedEvent({
          ...partition(suffix),
          number: 2,
          payload: { prnId: PRN_ID, amount: 10 }
        })
      )

      const result = await repository.getPrnCatchupEvents(params({ suffix }))

      expect(result).toHaveLength(2)
      expect(result[0].number).toBe(1)
      expect(result[0].kind).toBe(STREAM_EVENT_KIND.PRN_CREATED)
      expect(result[1].number).toBe(2)
      expect(result[1].kind).toBe(STREAM_EVENT_KIND.PRN_ISSUED)
    })

    it('filters out events at or below afterEventNumber', async ({
      insertWasteBalance,
      streamRepository
    }) => {
      const suffix = 'filter'
      await insertWasteBalance(balance(suffix))
      await streamRepository.appendEvent(
        buildPrnCreatedEvent({
          ...partition(suffix),
          number: 1,
          payload: { prnId: PRN_ID, amount: 10 }
        })
      )
      await streamRepository.appendEvent(
        buildPrnIssuedEvent({
          ...partition(suffix),
          number: 2,
          payload: { prnId: PRN_ID, amount: 10 }
        })
      )

      const result = await repository.getPrnCatchupEvents(
        params({ suffix, afterEventNumber: 1 })
      )

      expect(result).toHaveLength(1)
      expect(result[0].number).toBe(2)
    })

    it('throws Boom badData when accreditationId is missing', async () => {
      await expect(
        repository.getPrnCatchupEvents({
          registrationId: 'reg-missing-acc',
          accreditationId: undefined,
          prnId: PRN_ID,
          afterEventNumber: 0
        })
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 422 }
      })
    })
  })
}
