import { describe, it, expect } from 'vitest'

import { createInMemoryLedgerRepository } from '../repository/ledger-inmemory.js'
import { LEDGER_EVENT_KIND } from '../repository/ledger-schema.js'
import { buildLedgerEvent } from '../repository/ledger-test-data.js'
import { partialMock } from '#test/type-helpers.js'
import { currentWasteBalance } from './current-waste-balance.js'

const ledgerId = {
  organisationId: 'org-1',
  registrationId: 'reg-1',
  accreditationId: 'acc-1'
}

const submissionEvent = (number, creditTotal) =>
  buildLedgerEvent({
    number,
    kind: LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
    payload: { summaryLogId: `log-${number}`, creditTotal },
    closingBalance: { amount: creditTotal, availableAmount: creditTotal }
  })

const prnCreatedEvent = (number, amount, closingBalance) =>
  buildLedgerEvent({
    number,
    kind: LEDGER_EVENT_KIND.PRN_CREATED,
    payload: { prnId: 'prn-1', amount },
    closingBalance
  })

describe('currentWasteBalance', () => {
  it('returns null for an empty ledger', async () => {
    const repository = createInMemoryLedgerRepository()()

    expect(await currentWasteBalance(repository, ledgerId)).toBeNull()
  })

  it('resolves balance, head, and credit total from the ledger', async () => {
    const repository = createInMemoryLedgerRepository()()

    await repository.appendEvents([
      submissionEvent(1, 1000),
      prnCreatedEvent(2, 300, { amount: 1000, availableAmount: 700 })
    ])

    const balance = await currentWasteBalance(repository, ledgerId)

    expect(balance).toEqual({
      organisationId: 'org-1',
      registrationId: 'reg-1',
      accreditationId: 'acc-1',
      amount: 1000,
      availableAmount: 700,
      decemberAmount: 0,
      decemberAvailableAmount: 0,
      eventNumber: 2,
      creditTotal: 1000,
      decemberCreditTotal: 0
    })
  })

  it('carries the latest credit total when several submissions precede a PRN', async () => {
    const repository = createInMemoryLedgerRepository()()

    await repository.appendEvents([
      submissionEvent(1, 1000),
      submissionEvent(2, 2500)
    ])

    const balance = await currentWasteBalance(repository, ledgerId)

    expect(balance?.creditTotal).toBe(2500)
    expect(balance?.eventNumber).toBe(2)
  })

  it('keeps the credit-total base at the latest submission when a PRN follows', async () => {
    const repository = createInMemoryLedgerRepository()()

    await repository.appendEvents([
      submissionEvent(1, 1000),
      prnCreatedEvent(2, 300, { amount: 1000, availableAmount: 700 })
    ])

    const balance = await currentWasteBalance(repository, ledgerId)

    expect(balance?.creditTotal).toBe(1000)
  })

  it('coalesces a missing December portion to zero for a pre-feature event', async () => {
    // A submission event written before December accrual carries no December
    // fields on its closing balance or payload. Reading it directly (bypassing
    // the schema defaults an append would apply) must still resolve December to
    // zero rather than undefined.
    const preFeatureEvent = {
      ...ledgerId,
      number: 1,
      kind: LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
      payload: { summaryLogId: 'log-1', creditTotal: 1000 },
      openingBalance: { amount: 0, availableAmount: 0 },
      closingBalance: { amount: 1000, availableAmount: 1000 },
      createdAt: new Date(),
      createdBy: { id: 'system' }
    }
    const repository = partialMock({
      findLatestInLedger: async () => preFeatureEvent,
      findLatestInLedgerByKind: async () => preFeatureEvent
    })

    const balance = await currentWasteBalance(repository, ledgerId)

    expect(balance?.decemberAmount).toBe(0)
    expect(balance?.decemberAvailableAmount).toBe(0)
    expect(balance?.decemberCreditTotal).toBe(0)
  })

  it('reports a zero credit total for a ledgerId with no submission event', async () => {
    const repository = createInMemoryLedgerRepository()()
    await repository.appendEvents([
      buildLedgerEvent({
        registrationId: 'reg-1',
        accreditationId: 'acc-1',
        number: 1,
        kind: LEDGER_EVENT_KIND.PRN_CREATED,
        payload: { prnId: 'prn-1', amount: 0 },
        closingBalance: { amount: 0, availableAmount: 0 }
      })
    ])

    const balance = await currentWasteBalance(repository, ledgerId)

    expect(balance?.creditTotal).toBe(0)
  })
})
