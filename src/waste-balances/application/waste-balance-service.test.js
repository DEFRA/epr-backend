import { describe, it, expect, beforeEach } from 'vitest'

import { createInMemoryLedgerRepository } from '../repository/ledger-inmemory.js'
import { LEDGER_EVENT_KIND } from '../repository/ledger-schema.js'
import { LedgerSlotConflictError } from '../repository/ledger-port.js'
import {
  buildPrnCreatedEvent,
  buildPrnIssuedEvent
} from '../repository/ledger-test-data.js'
import {
  createPrn as decideCreatePrn,
  issuePrn as decideIssuePrn,
  cancelPrnCreation as decideCancelPrnCreation,
  cancelIssuedPrn as decideCancelIssuedPrn,
  acceptPrn as decideAcceptPrn,
  rejectPrn as decideRejectPrn,
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
  let ledgerRepository
  let service

  beforeEach(() => {
    ledgerRepository = createInMemoryLedgerRepository()()
    service = createWasteBalanceService(ledgerRepository)
  })

  describe('commitSummaryLogSubmittedEvent', () => {
    it('opens the ledger from zero on the first submission', async () => {
      const [event] = await service.commitSummaryLogSubmittedEvent(
        ledgerId,
        { summaryLogId: 'log-A', creditTotal: 150 },
        createdBy
      )

      expect(event.number).toBe(1)
      expect(event.organisationId).toBe('org-1')
      expect(event.registrationId).toBe('reg-1')
      expect(event.accreditationId).toBe('acc-1')
      expect(event.kind).toBe(LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED)
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
      await service.commitSummaryLogSubmittedEvent(
        ledgerId,
        { summaryLogId: 'log-A', creditTotal: 150 },
        createdBy
      )

      const [event] = await service.commitSummaryLogSubmittedEvent(
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
        service.commitSummaryLogSubmittedEvent(
          ledgerId,
          { summaryLogId: 'log-A', creditTotal: 150 },
          createdBy
        ),
        service.commitSummaryLogSubmittedEvent(
          ledgerId,
          { summaryLogId: 'log-B', creditTotal: 200 },
          createdBy
        )
      ])

      const fulfilled = results.filter((r) => r.status === 'fulfilled')
      const rejected = results.filter((r) => r.status === 'rejected')
      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      expect(rejected[0].reason).toBeInstanceOf(LedgerSlotConflictError)

      const all = await ledgerRepository.findAllInLedger({
        organisationId: 'org-1',
        registrationId: 'reg-1',
        accreditationId: 'acc-1'
      })
      expect(all).toHaveLength(1)
    })
  })

  describe('PRN commands', () => {
    const seedLedger = (creditTotal = 1000) =>
      service.commitSummaryLogSubmittedEvent(
        ledgerId,
        { summaryLogId: 'seed', creditTotal },
        createdBy
      )

    /**
     * Run one of the pure deciders as the command's decision. A real caller
     * rules on more than the balance before delegating here; these cases are
     * about what the ledger does with the decision it gets back.
     *
     * @param {(balance: *, payload: *) => *} decide
     * @param {*} payload
     */
    const runCommand = async (decide, payload) => {
      const { result } = await service.runPrnCommand(
        ledgerId,
        payload,
        createdBy,
        async (balance) => ({
          decision: decide(balance, payload),
          context: null
        })
      )
      return result
    }

    it('createPrn commits a prn-created event ringfencing the available balance', async () => {
      await seedLedger()

      const result = await runCommand(decideCreatePrn, {
        prnId: 'prn-1',
        amount: 100
      })

      expect(result.status).toBe(PRN_COMMAND_STATUS.COMMITTED)
      const [event] = result.events
      expect(event.number).toBe(2)
      expect(event.kind).toBe(LEDGER_EVENT_KIND.PRN_CREATED)
      expect(event.payload).toEqual({ prnId: 'prn-1', amount: 100 })
      expect(event.closingBalance).toEqual({
        amount: 1000,
        availableAmount: 900
      })
    })

    it('createPrn rejects insufficient available balance without appending', async () => {
      await seedLedger(50)

      const result = await runCommand(decideCreatePrn, {
        prnId: 'prn-1',
        amount: 100
      })

      expect(result).toEqual({
        status: PRN_COMMAND_STATUS.REJECTED,
        reason: PRN_COMMAND_REJECTION.INSUFFICIENT_AVAILABLE_BALANCE
      })
      const all = await ledgerRepository.findAllInLedger({
        organisationId: 'org-1',
        registrationId: 'reg-1',
        accreditationId: 'acc-1'
      })
      expect(all).toHaveLength(1)
    })

    it('hands the decision a null balance when the ledger has no events', async () => {
      // What a missing ledger means depends on the transition being made, so
      // the ledger reports it rather than ruling on it.
      const { result } = await service.runPrnCommand(
        ledgerId,
        { prnId: 'prn-1', amount: 100 },
        createdBy,
        async (balance) => {
          expect(balance).toBeNull()
          return {
            decision: {
              status: PRN_COMMAND_STATUS.REJECTED,
              reason: PRN_COMMAND_REJECTION.NO_LEDGER
            },
            context: null
          }
        }
      )

      expect(result).toEqual({
        status: PRN_COMMAND_STATUS.REJECTED,
        reason: PRN_COMMAND_REJECTION.NO_LEDGER
      })
      expect(await ledgerRepository.findAllInLedger(ledgerId)).toHaveLength(0)
    })

    it('issuePrn commits a prn-issued event deducting the total balance', async () => {
      await seedLedger()

      const result = await runCommand(decideIssuePrn, {
        prnId: 'prn-1',
        amount: 75
      })

      expect(result.status).toBe(PRN_COMMAND_STATUS.COMMITTED)
      expect(result.events[0].closingBalance).toEqual({
        amount: 925,
        availableAmount: 1000
      })
    })

    it('issuePrn rejects insufficient total balance', async () => {
      await seedLedger(50)

      const result = await runCommand(decideIssuePrn, {
        prnId: 'prn-1',
        amount: 100
      })

      expect(result.reason).toBe(
        PRN_COMMAND_REJECTION.INSUFFICIENT_TOTAL_BALANCE
      )
    })

    it('cancelPrnCreation commits a credit of the available balance', async () => {
      await seedLedger()
      await runCommand(decideCreatePrn, { prnId: 'prn-1', amount: 100 })

      const result = await runCommand(decideCancelPrnCreation, {
        prnId: 'prn-1',
        amount: 100
      })

      expect(result.events[0].kind).toBe(
        LEDGER_EVENT_KIND.PRN_CREATION_CANCELLED
      )
      expect(result.events[0].closingBalance).toEqual({
        amount: 1000,
        availableAmount: 1000
      })
    })

    it('cancelIssuedPrn commits a credit of both balances', async () => {
      await seedLedger()
      await runCommand(decideIssuePrn, { prnId: 'prn-1', amount: 100 })

      const result = await runCommand(decideCancelIssuedPrn, {
        prnId: 'prn-1',
        amount: 100
      })

      expect(result.events[0].kind).toBe(
        LEDGER_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE
      )
      expect(result.events[0].closingBalance).toEqual({
        amount: 1000,
        availableAmount: 1100
      })
    })

    it('acceptPrn commits a status-only event leaving the balance unchanged', async () => {
      await seedLedger()

      const result = await runCommand(decideAcceptPrn, {
        prnId: 'prn-1',
        amount: 100
      })

      expect(result.events[0].kind).toBe(LEDGER_EVENT_KIND.PRN_ACCEPTED)
      expect(result.events[0].closingBalance).toEqual({
        amount: 1000,
        availableAmount: 1000
      })
    })

    it('rejectPrn commits a status-only event leaving the balance unchanged', async () => {
      await seedLedger()

      const result = await runCommand(decideRejectPrn, {
        prnId: 'prn-1',
        amount: 100
      })

      expect(result.events[0].kind).toBe(LEDGER_EVENT_KIND.PRN_REJECTED)
      expect(result.events[0].closingBalance).toEqual({
        amount: 1000,
        availableAmount: 1000
      })
    })

    it('rejects a zero amount as a broken invariant before deciding', async () => {
      await seedLedger()

      await expect(
        runCommand(decideCreatePrn, { prnId: 'prn-1', amount: 0 })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 500 } })
    })

    it('rejects a negative amount without inflating the balance', async () => {
      await seedLedger()

      await expect(
        runCommand(decideCreatePrn, { prnId: 'prn-1', amount: -100 })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 500 } })

      const all = await ledgerRepository.findAllInLedger({
        organisationId: 'org-1',
        registrationId: 'reg-1',
        accreditationId: 'acc-1'
      })
      expect(all).toHaveLength(1)
    })

    it('rejects a non-positive amount before the decision runs', async () => {
      await seedLedger()
      let decided = false

      await expect(
        service.runPrnCommand(
          ledgerId,
          { prnId: 'prn-1', amount: -1 },
          createdBy,
          async () => {
            decided = true
            return {
              decision: { status: PRN_COMMAND_STATUS.COMMITTED, events: [] },
              context: null
            }
          }
        )
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 500 } })

      expect(decided).toBe(false)
    })

    it('decides against the head it appends at, not the one the caller read', async () => {
      await seedLedger()

      // What the caller saw before it asked for the command.
      const readByCaller = await service.currentBalance(ledgerId)
      expect(readByCaller?.availableAmount).toBe(1000)

      // A competing writer lands after that read and before the command runs.
      await runCommand(decideCreatePrn, { prnId: 'prn-2', amount: 10 })

      /** @type {number[]} */
      const balancesSeen = []
      await service.runPrnCommand(
        ledgerId,
        { prnId: 'prn-1', amount: 10 },
        createdBy,
        async (balance) => {
          balancesSeen.push(balance.availableAmount)
          return {
            decision: decideCreatePrn(balance, { prnId: 'prn-1', amount: 10 }),
            context: null
          }
        }
      )

      expect(balancesSeen).toEqual([990])
      expect(await service.currentBalance(ledgerId)).toMatchObject({
        availableAmount: 980
      })
    })

    it('appends nothing when the decision throws', async () => {
      await seedLedger()

      await expect(
        service.runPrnCommand(
          ledgerId,
          { prnId: 'prn-1', amount: 10 },
          createdBy,
          async () => {
            throw new Error('the PRN has already moved on')
          }
        )
      ).rejects.toThrow('the PRN has already moved on')

      const all = await ledgerRepository.findAllInLedger(ledgerId)
      expect(all).toHaveLength(1)
    })
  })

  describe('prnCatchupEvents', () => {
    const catchupParams = {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      accreditationId: 'acc-1',
      prnId: 'prn-1'
    }

    it('returns the PRN tail events after the watermark in order', async () => {
      await ledgerRepository.appendEvents([
        buildPrnCreatedEvent({
          registrationId: 'reg-1',
          accreditationId: 'acc-1',
          number: 1,
          payload: { prnId: 'prn-1', amount: 10 }
        })
      ])
      await ledgerRepository.appendEvents([
        buildPrnIssuedEvent({
          registrationId: 'reg-1',
          accreditationId: 'acc-1',
          number: 2,
          payload: { prnId: 'prn-1', amount: 10 }
        })
      ])

      const events = await service.prnCatchupEvents({
        ...catchupParams,
        afterEventNumber: 1
      })

      expect(events).toHaveLength(1)
      expect(events[0].number).toBe(2)
      expect(events[0].kind).toBe(LEDGER_EVENT_KIND.PRN_ISSUED)
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

  describe('submitSummaryLog', () => {
    it('does not touch the ledger when there are no waste records to credit', async () => {
      await service.submitSummaryLog([], {
        user: createdBy,
        accreditation: { id: 'acc-1' },
        overseasSites: /** @type {*} */ (new Map()),
        summaryLogId: 'log-A'
      })

      const all = await ledgerRepository.findAllInLedger({
        organisationId: 'org-1',
        registrationId: 'reg-1',
        accreditationId: 'acc-1'
      })
      expect(all).toHaveLength(0)
    })
  })

  describe('currentBalance', () => {
    it('resolves to null for a ledger with no events', async () => {
      expect(await service.currentBalance(ledgerId)).toBeNull()
    })

    it('folds the ledger into its current balance', async () => {
      await service.commitSummaryLogSubmittedEvent(
        ledgerId,
        { summaryLogId: 'log-A', creditTotal: 150 },
        createdBy
      )
      await service.runPrnCommand(
        ledgerId,
        { prnId: 'prn-1', amount: 40 },
        createdBy,
        async (balance) => ({
          decision: decideCreatePrn(balance, { prnId: 'prn-1', amount: 40 }),
          context: null
        })
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
