import { describe, it, expect, beforeEach } from 'vitest'

import { createInMemoryStreamRepository } from '../repository/stream-inmemory.js'
import { STREAM_EVENT_KIND } from '../repository/stream-schema.js'
import { StreamSlotConflictError } from '../repository/stream-port.js'
import {
  buildPrnCreatedEvent,
  buildPrnIssuedEvent
} from '../repository/stream-test-data.js'
import {
  PRN_COMMAND_STATUS,
  PRN_COMMAND_REJECTION
} from '../domain/commands.js'
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

  describe('PRN commands', () => {
    const seedLedger = (creditTotal = 1000) =>
      service.submitSummaryLog(
        ledgerId,
        { summaryLogId: 'seed', creditTotal },
        createdBy
      )

    it('createPrn commits a prn-created event ringfencing the available balance', async () => {
      await seedLedger()

      const result = await service.createPrn(
        ledgerId,
        { prnId: 'prn-1', amount: 100 },
        createdBy
      )

      expect(result.status).toBe(PRN_COMMAND_STATUS.COMMITTED)
      const [event] = result.events
      expect(event.number).toBe(2)
      expect(event.kind).toBe(STREAM_EVENT_KIND.PRN_CREATED)
      expect(event.payload).toEqual({ prnId: 'prn-1', amount: 100 })
      expect(event.closingBalance).toEqual({
        amount: 1000,
        availableAmount: 900
      })
    })

    it('createPrn rejects insufficient available balance without appending', async () => {
      await seedLedger(50)

      const result = await service.createPrn(
        ledgerId,
        { prnId: 'prn-1', amount: 100 },
        createdBy
      )

      expect(result).toEqual({
        status: PRN_COMMAND_STATUS.REJECTED,
        reason: PRN_COMMAND_REJECTION.INSUFFICIENT_AVAILABLE_BALANCE
      })
      const all = await streamRepository.findAllByPartition('reg-1', 'acc-1')
      expect(all).toHaveLength(1)
    })

    it('rejects with no-ledger when the partition has no events', async () => {
      const result = await service.createPrn(
        ledgerId,
        { prnId: 'prn-1', amount: 100 },
        createdBy
      )

      expect(result).toEqual({
        status: PRN_COMMAND_STATUS.REJECTED,
        reason: PRN_COMMAND_REJECTION.NO_LEDGER
      })
    })

    it('issuePrn commits a prn-issued event deducting the total balance', async () => {
      await seedLedger()

      const result = await service.issuePrn(
        ledgerId,
        { prnId: 'prn-1', amount: 75 },
        createdBy
      )

      expect(result.status).toBe(PRN_COMMAND_STATUS.COMMITTED)
      expect(result.events[0].closingBalance).toEqual({
        amount: 925,
        availableAmount: 1000
      })
    })

    it('issuePrn rejects insufficient total balance', async () => {
      await seedLedger(50)

      const result = await service.issuePrn(
        ledgerId,
        { prnId: 'prn-1', amount: 100 },
        createdBy
      )

      expect(result.reason).toBe(
        PRN_COMMAND_REJECTION.INSUFFICIENT_TOTAL_BALANCE
      )
    })

    it('cancelPrnCreation commits a credit of the available balance', async () => {
      await seedLedger()
      await service.createPrn(
        ledgerId,
        { prnId: 'prn-1', amount: 100 },
        createdBy
      )

      const result = await service.cancelPrnCreation(
        ledgerId,
        { prnId: 'prn-1', amount: 100 },
        createdBy
      )

      expect(result.events[0].kind).toBe(
        STREAM_EVENT_KIND.PRN_CREATION_CANCELLED
      )
      expect(result.events[0].closingBalance).toEqual({
        amount: 1000,
        availableAmount: 1000
      })
    })

    it('cancelIssuedPrn commits a credit of both balances', async () => {
      await seedLedger()
      await service.issuePrn(
        ledgerId,
        { prnId: 'prn-1', amount: 100 },
        createdBy
      )

      const result = await service.cancelIssuedPrn(
        ledgerId,
        { prnId: 'prn-1', amount: 100 },
        createdBy
      )

      expect(result.events[0].kind).toBe(
        STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE
      )
      expect(result.events[0].closingBalance).toEqual({
        amount: 1000,
        availableAmount: 1100
      })
    })

    it('acceptPrn commits a status-only event leaving the balance unchanged', async () => {
      await seedLedger()

      const result = await service.acceptPrn(
        ledgerId,
        { prnId: 'prn-1', amount: 100 },
        createdBy
      )

      expect(result.events[0].kind).toBe(STREAM_EVENT_KIND.PRN_ACCEPTED)
      expect(result.events[0].closingBalance).toEqual({
        amount: 1000,
        availableAmount: 1000
      })
    })

    it('rejectPrn commits a status-only event leaving the balance unchanged', async () => {
      await seedLedger()

      const result = await service.rejectPrn(
        ledgerId,
        { prnId: 'prn-1', amount: 100 },
        createdBy
      )

      expect(result.events[0].kind).toBe(STREAM_EVENT_KIND.PRN_REJECTED)
      expect(result.events[0].closingBalance).toEqual({
        amount: 1000,
        availableAmount: 1000
      })
    })
  })

  describe('prnCatchupEvents', () => {
    const catchupParams = {
      registrationId: 'reg-1',
      accreditationId: 'acc-1',
      prnId: 'prn-1'
    }

    it('returns the PRN tail events after the watermark in order', async () => {
      await streamRepository.appendEvent(
        buildPrnCreatedEvent({
          registrationId: 'reg-1',
          accreditationId: 'acc-1',
          number: 1,
          payload: { prnId: 'prn-1', amount: 10 }
        })
      )
      await streamRepository.appendEvent(
        buildPrnIssuedEvent({
          registrationId: 'reg-1',
          accreditationId: 'acc-1',
          number: 2,
          payload: { prnId: 'prn-1', amount: 10 }
        })
      )

      const events = await service.prnCatchupEvents({
        ...catchupParams,
        afterEventNumber: 1
      })

      expect(events).toHaveLength(1)
      expect(events[0].number).toBe(2)
      expect(events[0].kind).toBe(STREAM_EVENT_KIND.PRN_ISSUED)
    })

    it('throws Boom badData when the accreditation id is invalid', async () => {
      await expect(
        service.prnCatchupEvents({
          ...catchupParams,
          accreditationId: undefined,
          afterEventNumber: 0
        })
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 422 }
      })
    })
  })

  describe('updateWasteBalanceTransactions', () => {
    it('does not touch the ledger when there are no waste records to credit', async () => {
      await service.updateWasteBalanceTransactions([], {
        user: createdBy,
        accreditation: { id: 'acc-1' },
        overseasSites: /** @type {*} */ (new Map()),
        summaryLogId: 'log-A'
      })

      const all = await streamRepository.findAllByPartition('reg-1', 'acc-1')
      expect(all).toHaveLength(0)
    })
  })

  describe('currentBalance', () => {
    it('resolves to null for a ledger with no events', async () => {
      expect(await service.currentBalance(ledgerId)).toBeNull()
    })

    it('folds the ledger into its current balance', async () => {
      await service.submitSummaryLog(
        ledgerId,
        { summaryLogId: 'log-A', creditTotal: 150 },
        createdBy
      )
      await service.createPrn(
        ledgerId,
        { prnId: 'prn-1', amount: 40 },
        createdBy
      )

      const balance = await service.currentBalance(ledgerId)

      expect(balance).toMatchObject({
        registrationId: 'reg-1',
        accreditationId: 'acc-1',
        amount: 150,
        availableAmount: 110
      })
    })
  })
})
