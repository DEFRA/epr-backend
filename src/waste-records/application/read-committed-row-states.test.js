import { describe, it, expect } from 'vitest'

import { createInMemoryRowStateRepository } from '#repositories/waste-records/committed-row-states/inmemory.js'
import { createInMemoryStreamRepository } from '#waste-balances/repository/stream-inmemory.js'
import {
  buildRowStateEntry,
  DEFAULT_PARTITION
} from '#repositories/waste-records/committed-row-states/test-data.js'
import { buildStreamEvent } from '#waste-balances/repository/stream-test-data.js'
import { committedRowStatesForRegistration } from './read-committed-row-states.js'

const submissionEvent = (number, summaryLogId) =>
  buildStreamEvent({
    number,
    payload: { summaryLogId, creditTotal: number * 10 }
  })

const registration = {
  organisationId: DEFAULT_PARTITION.organisationId,
  registrationId: DEFAULT_PARTITION.registrationId,
  accreditationId: DEFAULT_PARTITION.accreditationId
}

describe('committedRowStatesForRegistration', () => {
  it('returns an empty array when the stream has no submission', async () => {
    const states = await committedRowStatesForRegistration({
      streamRepository: createInMemoryStreamRepository()(),
      rowStateRepository: createInMemoryRowStateRepository()(),
      ...registration
    })

    expect(states).toEqual([])
  })

  it('returns the full committed snapshot at the head submission', async () => {
    const rowStateRepository = createInMemoryRowStateRepository()()
    await rowStateRepository.upsertRowStates(
      DEFAULT_PARTITION,
      [
        buildRowStateEntry({ rowId: 'row-1', data: { tonnage: 10 } }),
        buildRowStateEntry({ rowId: 'row-2', data: { tonnage: 20 } })
      ],
      'log-1'
    )
    await rowStateRepository.upsertRowStates(
      DEFAULT_PARTITION,
      [
        buildRowStateEntry({ rowId: 'row-1', data: { tonnage: 99 } }),
        buildRowStateEntry({ rowId: 'row-2', data: { tonnage: 20 } })
      ],
      'log-2'
    )

    const streamRepository = createInMemoryStreamRepository([
      submissionEvent(1, 'log-1'),
      submissionEvent(2, 'log-2')
    ])()

    const states = await committedRowStatesForRegistration({
      streamRepository,
      rowStateRepository,
      ...registration
    })

    const dataByRowId = Object.fromEntries(
      states.map((state) => [state.rowId, state.data])
    )
    expect(dataByRowId).toEqual({
      'row-1': { tonnage: 99 },
      'row-2': { tonnage: 20 }
    })
  })
})
