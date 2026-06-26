import { describe, it, expect } from 'vitest'

import { createInMemoryStreamRepository } from '../repository/stream-inmemory.js'
import { STREAM_EVENT_KIND, ZERO_BALANCE } from '../repository/stream-schema.js'
import { appendRegisteredOnlyHead } from './append-registered-only-head.js'

const createdBy = { id: 'user-1', name: 'Reg User', email: 'reg@example.test' }

describe('appendRegisteredOnlyHead', () => {
  it('emits a zero-delta summary-log-submitted head into the null-accreditation partition', async () => {
    const repository = createInMemoryStreamRepository()()

    const event = await appendRegisteredOnlyHead({
      repository,
      registrationId: 'reg-1',
      organisationId: 'org-1',
      summaryLogId: 'log-1',
      createdBy
    })

    expect(event.kind).toBe(STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED)
    expect(event.accreditationId).toBeNull()
    expect(event.payload).toEqual({ summaryLogId: 'log-1', creditTotal: 0 })
    expect(event.openingBalance).toEqual(ZERO_BALANCE)
    expect(event.closingBalance).toEqual(ZERO_BALANCE)
  })

  it('keeps the balance unchanged across successive reg-only heads', async () => {
    const repository = createInMemoryStreamRepository()()

    await appendRegisteredOnlyHead({
      repository,
      registrationId: 'reg-1',
      organisationId: 'org-1',
      summaryLogId: 'log-1',
      createdBy
    })
    const second = await appendRegisteredOnlyHead({
      repository,
      registrationId: 'reg-1',
      organisationId: 'org-1',
      summaryLogId: 'log-2',
      createdBy
    })

    expect(second.number).toBe(2)
    expect(second.closingBalance).toEqual(ZERO_BALANCE)
  })
})
