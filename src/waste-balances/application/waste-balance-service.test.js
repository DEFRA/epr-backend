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

/**
 * @import { LedgerBalanceSnapshot, PrnPayload, PrnAcceptedPayload } from '#waste-balances/repository/ledger-schema.js'
 * @import { PrnDecision } from '#waste-balances/domain/commands.js'
 */

/**
 * The events a decider committed. Every caller below has already put enough
 * balance on the ledger, so a rejection here is the test's own mistake.
 *
 * @param {PrnDecision} decision
 */
const committedEvents = (decision) => {
  if (decision.status === PRN_COMMAND_STATUS.REJECTED) {
    throw new Error(`expected a committed decision, got ${decision.reason}`)
  }
  return decision.events
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

  describe('a balance read for update', () => {
    const seedLedger = (creditTotal = 1000) =>
      service.commitSummaryLogSubmittedEvent(
        ledgerId,
        { summaryLogId: 'seed', creditTotal },
        createdBy
      )

    /**
     * Fold the ledger and run one of the pure deciders against the balance,
     * without committing. A real caller rules on more than the balance before
     * deciding; these cases are about what the ledger hands it and what it does
     * with the decision that comes back.
     *
     * Every case below seeds the ledger first, so the fold resolves a balance
     * and the deciders — which take a snapshot, not a nullable one — can be
     * handed it directly.
     *
     * @param {(balance: LedgerBalanceSnapshot, payload: PrnPayload & PrnAcceptedPayload) => PrnDecision} decide
     * @param {PrnPayload & PrnAcceptedPayload} payload
     */
    const decideCommand = async (decide, payload) => {
      const { balance } = await service.readBalanceForUpdate(
        ledgerId,
        createdBy
      )
      return decide(/** @type {LedgerBalanceSnapshot} */ (balance), payload)
    }

    /**
     * A caller in miniature: read the balance for update, decide against what
     * it folded, and commit the decision that comes back.
     *
     * @param {(balance: LedgerBalanceSnapshot, payload: PrnPayload & PrnAcceptedPayload) => PrnDecision} decide
     * @param {PrnPayload & PrnAcceptedPayload} payload
     */
    const runCommand = async (decide, payload) => {
      const { balance, append } = await service.readBalanceForUpdate(
        ledgerId,
        createdBy
      )
      const decision = decide(
        /** @type {LedgerBalanceSnapshot} */ (balance),
        payload
      )
      return {
        status: decision.status,
        events: await append(committedEvents(decision))
      }
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

      const decision = await decideCommand(decideCreatePrn, {
        prnId: 'prn-1',
        amount: 100
      })

      expect(decision).toEqual({
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

    it('hands back a null balance when the ledger has no events', async () => {
      // What a missing ledger means depends on the transition being made, so
      // the ledger reports it rather than ruling on it.
      const { balance } = await service.readBalanceForUpdate(
        ledgerId,
        createdBy
      )

      expect(balance).toBeNull()
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

      const decision = await decideCommand(decideIssuePrn, {
        prnId: 'prn-1',
        amount: 100
      })

      expect(decision).toEqual({
        status: PRN_COMMAND_STATUS.REJECTED,
        reason: PRN_COMMAND_REJECTION.INSUFFICIENT_TOTAL_BALANCE
      })
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

    it('decides against the head it appends at, not the one the caller read', async () => {
      await seedLedger()

      // What the caller saw before it asked to read for update.
      const readByCaller = await service.currentBalance(ledgerId)
      expect(readByCaller?.availableAmount).toBe(1000)

      // A competing writer lands after that read and before the command runs.
      await runCommand(decideCreatePrn, { prnId: 'prn-2', amount: 10 })

      const payload = { prnId: 'prn-1', amount: 10 }
      const { balance, append } = await service.readBalanceForUpdate(
        ledgerId,
        createdBy
      )
      await append(committedEvents(decideCreatePrn(balance, payload)))

      expect(balance.availableAmount).toBe(990)
      expect(await service.currentBalance(ledgerId)).toMatchObject({
        availableAmount: 980
      })
    })

    it('appends nothing when the caller never commits', async () => {
      await seedLedger()

      await service.readBalanceForUpdate(ledgerId, createdBy)

      const all = await ledgerRepository.findAllInLedger(ledgerId)
      expect(all).toHaveLength(1)
    })

    it('refuses a second commit, because the stream tip it folded at has moved on', async () => {
      await seedLedger()

      const payload = { prnId: 'prn-1', amount: 10 }
      const { balance, append } = await service.readBalanceForUpdate(
        ledgerId,
        createdBy
      )
      const events = committedEvents(decideCreatePrn(balance, payload))
      await append(events)

      await expect(append(events)).rejects.toEqual(
        expect.objectContaining({ isBoom: true })
      )
      expect(await ledgerRepository.findAllInLedger(ledgerId)).toHaveLength(2)
    })

    it('commits at the head it folded at, so a competitor that lands first wins the slot', async () => {
      await seedLedger()

      const payload = { prnId: 'prn-1', amount: 10 }
      const { balance, append } = await service.readBalanceForUpdate(
        ledgerId,
        createdBy
      )

      // A competing writer takes the slot between the fold and the commit.
      await runCommand(decideCreatePrn, { prnId: 'prn-2', amount: 10 })

      await expect(
        append(committedEvents(decideCreatePrn(balance, payload)))
      ).rejects.toBeInstanceOf(LedgerSlotConflictError)
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
      const payload = { prnId: 'prn-1', amount: 40 }
      const { balance: folded, append } = await service.readBalanceForUpdate(
        ledgerId,
        createdBy
      )
      await append(committedEvents(decideCreatePrn(folded, payload)))

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
