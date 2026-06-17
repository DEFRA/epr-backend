import { describe, it, expect } from 'vitest'

import { createInMemoryStreamRepository } from '../repository/stream-inmemory.js'
import {
  buildStreamEvent,
  buildPrnCreatedEvent
} from '../repository/stream-test-data.js'
import { latestCommittedSummaryLogId } from './latest-committed-summary-log-id.js'

const PARTITION = { registrationId: 'reg-1', accreditationId: 'acc-1' }

describe('latestCommittedSummaryLogId', () => {
  it('returns null when the partition has no events', async () => {
    const streamRepository = createInMemoryStreamRepository()()

    expect(
      await latestCommittedSummaryLogId(streamRepository, PARTITION)
    ).toBeNull()
  })

  it('returns null when the partition has events but no submission', async () => {
    const streamRepository = createInMemoryStreamRepository([
      buildPrnCreatedEvent({ number: 1 })
    ])()

    expect(
      await latestCommittedSummaryLogId(streamRepository, PARTITION)
    ).toBeNull()
  })

  it('returns the summaryLogId of the only submission', async () => {
    const streamRepository = createInMemoryStreamRepository([
      buildStreamEvent({
        number: 1,
        payload: { summaryLogId: 'log-1', creditTotal: 100 }
      })
    ])()

    expect(await latestCommittedSummaryLogId(streamRepository, PARTITION)).toBe(
      'log-1'
    )
  })

  it('returns the latest submission, ignoring a later PRN event', async () => {
    const streamRepository = createInMemoryStreamRepository([
      buildStreamEvent({
        number: 1,
        payload: { summaryLogId: 'log-1', creditTotal: 100 }
      }),
      buildStreamEvent({
        number: 2,
        payload: { summaryLogId: 'log-2', creditTotal: 150 }
      }),
      buildPrnCreatedEvent({ number: 3 })
    ])()

    expect(await latestCommittedSummaryLogId(streamRepository, PARTITION)).toBe(
      'log-2'
    )
  })

  it('resolves the committed head for a registered-only stream', async () => {
    const streamRepository = createInMemoryStreamRepository([
      buildStreamEvent({
        number: 1,
        accreditationId: null,
        payload: { summaryLogId: 'log-1', creditTotal: 100 }
      })
    ])()

    expect(
      await latestCommittedSummaryLogId(streamRepository, {
        registrationId: 'reg-1',
        accreditationId: null
      })
    ).toBe('log-1')
  })
})
