import { describe, it, expect } from 'vitest'

import { createInMemoryStreamRepository } from '../repository/stream-inmemory.js'
import { STREAM_EVENT_KIND, ZERO_BALANCE } from '../repository/stream-schema.js'
import { appendSummaryLogSubmittedEvent } from './append-summary-log-submitted-event.js'

const createdBy = { id: 'user-1', name: 'Reg User', email: 'reg@example.test' }

describe('appendSummaryLogSubmittedEvent', () => {
  it('emits a zero-delta event into the null-accreditation partition for a registered-only submission', async () => {
    const repository = createInMemoryStreamRepository()()

    const event = await appendSummaryLogSubmittedEvent({
      repository,
      registrationId: 'reg-1',
      accreditationId: null,
      organisationId: 'org-1',
      summaryLogId: 'log-1',
      creditTotal: 0,
      createdBy
    })

    expect(event.kind).toBe(STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED)
    expect(event.accreditationId).toBeNull()
    expect(event.payload).toEqual({ summaryLogId: 'log-1', creditTotal: 0 })
    expect(event.openingBalance).toEqual(ZERO_BALANCE)
    expect(event.closingBalance).toEqual(ZERO_BALANCE)
  })

  it('carries the credit total into the accreditation partition for an accredited submission', async () => {
    const repository = createInMemoryStreamRepository()()

    const event = await appendSummaryLogSubmittedEvent({
      repository,
      registrationId: 'reg-1',
      accreditationId: 'acc-1',
      organisationId: 'org-1',
      summaryLogId: 'log-1',
      creditTotal: 50,
      createdBy
    })

    expect(event.kind).toBe(STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED)
    expect(event.accreditationId).toBe('acc-1')
    expect(event.payload).toEqual({ summaryLogId: 'log-1', creditTotal: 50 })
    expect(event.closingBalance).toMatchObject({
      amount: 50,
      availableAmount: 50
    })
  })

  it('keeps the balance unchanged across successive zero-delta events', async () => {
    const repository = createInMemoryStreamRepository()()

    await appendSummaryLogSubmittedEvent({
      repository,
      registrationId: 'reg-1',
      accreditationId: null,
      organisationId: 'org-1',
      summaryLogId: 'log-1',
      creditTotal: 0,
      createdBy
    })
    const second = await appendSummaryLogSubmittedEvent({
      repository,
      registrationId: 'reg-1',
      accreditationId: null,
      organisationId: 'org-1',
      summaryLogId: 'log-2',
      creditTotal: 0,
      createdBy
    })

    expect(second.number).toBe(2)
    expect(second.closingBalance).toEqual(ZERO_BALANCE)
  })
})
