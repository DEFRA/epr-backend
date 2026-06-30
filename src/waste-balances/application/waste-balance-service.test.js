import { describe, it, expect, beforeEach } from 'vitest'

import { createInMemoryStreamRepository } from '../repository/stream-inmemory.js'
import { STREAM_EVENT_KIND } from '../repository/stream-schema.js'
import { StreamSlotConflictError } from '../repository/stream-port.js'
import { createWasteBalanceService } from './waste-balance-service.js'

const ledgerId = {
  organisationId: 'org-1',
  registrationId: 'reg-1',
  accreditationId: 'acc-1'
}

const createdBy = {
  id: 'user-1',
  name: 'Test User',
  email: 'user@example.test'
}

describe('createWasteBalanceService', () => {
  let streamRepository
  let service

  beforeEach(() => {
    streamRepository = createInMemoryStreamRepository()()
    service = createWasteBalanceService(streamRepository)
  })

  describe('submitSummaryLog', () => {
    it('opens the ledger from zero on the first submission', async () => {
      const [event] = await service.submitSummaryLog(
        ledgerId,
        { summaryLogId: 'log-A', creditTotal: 150 },
        createdBy
      )

      expect(event.number).toBe(1)
      expect(event.organisationId).toBe('org-1')
      expect(event.registrationId).toBe('reg-1')
      expect(event.accreditationId).toBe('acc-1')
      expect(event.kind).toBe(STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED)
      expect(event.payload).toEqual({ summaryLogId: 'log-A', creditTotal: 150 })
      expect(event.openingBalance).toEqual({ amount: 0, availableAmount: 0 })
      expect(event.closingBalance).toEqual({
        amount: 150,
        availableAmount: 150
      })
      expect(event.createdBy).toEqual(createdBy)
      expect(event.createdAt).toBeInstanceOf(Date)
    })

    it('appends at the next head, moving the balance by the credit-total delta', async () => {
      await service.submitSummaryLog(
        ledgerId,
        { summaryLogId: 'log-A', creditTotal: 150 },
        createdBy
      )

      const [event] = await service.submitSummaryLog(
        ledgerId,
        { summaryLogId: 'log-B', creditTotal: 200 },
        createdBy
      )

      expect(event.number).toBe(2)
      expect(event.openingBalance).toEqual({
        amount: 150,
        availableAmount: 150
      })
      expect(event.closingBalance).toEqual({
        amount: 200,
        availableAmount: 200
      })
    })

    it('lets one of two concurrent submissions win and surfaces the loser as a slot conflict', async () => {
      const results = await Promise.allSettled([
        service.submitSummaryLog(
          ledgerId,
          { summaryLogId: 'log-A', creditTotal: 150 },
          createdBy
        ),
        service.submitSummaryLog(
          ledgerId,
          { summaryLogId: 'log-B', creditTotal: 200 },
          createdBy
        )
      ])

      const fulfilled = results.filter((r) => r.status === 'fulfilled')
      const rejected = results.filter((r) => r.status === 'rejected')
      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      expect(rejected[0].reason).toBeInstanceOf(StreamSlotConflictError)

      const all = await streamRepository.findAllByPartition('reg-1', 'acc-1')
      expect(all).toHaveLength(1)
    })
  })
})
