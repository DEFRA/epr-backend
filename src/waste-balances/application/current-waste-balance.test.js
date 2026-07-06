import { describe, it, expect } from 'vitest'

import { createInMemoryLedgerRepository } from '../repository/ledger-inmemory.js'
import { LEDGER_EVENT_KIND } from '../repository/ledger-schema.js'
import { buildStreamEvent } from '../repository/ledger-test-data.js'
import { currentWasteBalance } from './current-waste-balance.js'

const partition = {
  organisationId: 'org-1',
  registrationId: 'reg-1',
  accreditationId: 'acc-1'
}

const submissionEvent = (number, creditTotal) =>
  buildStreamEvent({
    number,
    kind: LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
    payload: { summaryLogId: `log-${number}`, creditTotal },
    closingBalance: { amount: creditTotal, availableAmount: creditTotal }
  })

const prnCreatedEvent = (number, amount, closingBalance) =>
  buildStreamEvent({
    number,
    kind: LEDGER_EVENT_KIND.PRN_CREATED,
    payload: { prnId: 'prn-1', amount },
    closingBalance
  })

describe('currentWasteBalance', () => {
  it('returns null for an empty partition', async () => {
    const repository = createInMemoryLedgerRepository()()

    expect(await currentWasteBalance(repository, partition)).toBeNull()
  })

  it('resolves balance, head, and credit total from the ledger', async () => {
    const repository = createInMemoryLedgerRepository()()

    await repository.appendEvents([
      submissionEvent(1, 1000),
      prnCreatedEvent(2, 300, { amount: 1000, availableAmount: 700 })
    ])

    const balance = await currentWasteBalance(repository, partition)

    expect(balance).toEqual({
      organisationId: 'org-1',
      registrationId: 'reg-1',
      accreditationId: 'acc-1',
      amount: 1000,
      availableAmount: 700,
      eventNumber: 2,
      creditTotal: 1000
    })
  })

  it('carries the latest credit total when several submissions precede a PRN', async () => {
    const repository = createInMemoryLedgerRepository()()

    await repository.appendEvents([
      submissionEvent(1, 1000),
      submissionEvent(2, 2500)
    ])

    const balance = await currentWasteBalance(repository, partition)

    expect(balance?.creditTotal).toBe(2500)
    expect(balance?.eventNumber).toBe(2)
  })

  it('keeps the credit-total base at the latest submission when a PRN follows', async () => {
    const repository = createInMemoryLedgerRepository()()

    await repository.appendEvents([
      submissionEvent(1, 1000),
      prnCreatedEvent(2, 300, { amount: 1000, availableAmount: 700 })
    ])

    const balance = await currentWasteBalance(repository, partition)

    expect(balance?.creditTotal).toBe(1000)
  })

  it('reports a zero credit total for a partition with no submission event', async () => {
    const repository = createInMemoryLedgerRepository()()
    await repository.appendEvents([
      buildStreamEvent({
        registrationId: 'reg-1',
        accreditationId: 'acc-1',
        number: 1,
        kind: LEDGER_EVENT_KIND.PRN_CREATED,
        payload: { prnId: 'prn-1', amount: 0 },
        closingBalance: { amount: 0, availableAmount: 0 }
      })
    ])

    const balance = await currentWasteBalance(repository, partition)

    expect(balance?.creditTotal).toBe(0)
  })
})
