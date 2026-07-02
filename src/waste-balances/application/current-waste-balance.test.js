import { describe, it, expect } from 'vitest'

import { createInMemoryStreamRepository } from '../repository/stream-inmemory.js'
import { STREAM_EVENT_KIND } from '../repository/stream-schema.js'
import { buildStreamEvent } from '../repository/stream-test-data.js'
import { currentWasteBalance } from './current-waste-balance.js'

const partition = {
  organisationId: 'org-1',
  registrationId: 'reg-1',
  accreditationId: 'acc-1'
}

const submissionEvent = (number, creditTotal) =>
  buildStreamEvent({
    number,
    kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
    payload: { summaryLogId: `log-${number}`, creditTotal },
    closingBalance: { amount: creditTotal, availableAmount: creditTotal }
  })

const prnCreatedEvent = (number, amount, closingBalance) =>
  buildStreamEvent({
    number,
    kind: STREAM_EVENT_KIND.PRN_CREATED,
    payload: { prnId: 'prn-1', amount },
    closingBalance
  })

describe('currentWasteBalance', () => {
  it('returns null for an empty partition', async () => {
    const repository = createInMemoryStreamRepository()()

    expect(await currentWasteBalance(repository, partition)).toBeNull()
  })

  it('resolves balance, head, and credit total from the stream', async () => {
    const repository = createInMemoryStreamRepository()()

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
    const repository = createInMemoryStreamRepository()()

    await repository.appendEvents([
      submissionEvent(1, 1000),
      submissionEvent(2, 2500)
    ])

    const balance = await currentWasteBalance(repository, partition)

    expect(balance?.creditTotal).toBe(2500)
    expect(balance?.eventNumber).toBe(2)
  })

  it('keeps the credit-total base at the latest submission when a PRN follows', async () => {
    const repository = createInMemoryStreamRepository()()

    await repository.appendEvents([
      submissionEvent(1, 1000),
      prnCreatedEvent(2, 300, { amount: 1000, availableAmount: 700 })
    ])

    const balance = await currentWasteBalance(repository, partition)

    expect(balance?.creditTotal).toBe(1000)
  })

  it('reports a zero credit total for a partition with no submission event', async () => {
    const repository = createInMemoryStreamRepository()()
    await repository.appendEvents([
      buildStreamEvent({
        registrationId: 'reg-1',
        accreditationId: 'acc-1',
        number: 1,
        kind: STREAM_EVENT_KIND.PRN_CREATED,
        payload: { prnId: 'prn-1', amount: 0 },
        closingBalance: { amount: 0, availableAmount: 0 }
      })
    ])

    const balance = await currentWasteBalance(repository, partition)

    expect(balance?.creditTotal).toBe(0)
  })
})
