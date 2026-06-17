import { describe, it, expect } from 'vitest'

import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

import { createInMemoryRowStateRepository } from '../repository/row-states-inmemory.js'
import { createInMemoryStreamRepository } from '../repository/stream-inmemory.js'
import {
  buildRowStateEntry,
  DEFAULT_PARTITION
} from '../repository/row-states-test-data.js'
import {
  buildStreamEvent,
  buildPrnCreatedEvent
} from '../repository/stream-test-data.js'
import {
  committedRowStatesForRegistration,
  committedRowStatesAt,
  rowHistory
} from './read-committed-row-states.js'

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

describe('committedRowStatesAt', () => {
  const submittedAt = (number, summaryLogId, iso) => ({
    ...submissionEvent(number, summaryLogId),
    createdAt: new Date(iso)
  })

  it('returns an empty array when no submission committed at or before the instant', async () => {
    const streamRepository = createInMemoryStreamRepository([
      submittedAt(1, 'log-1', '2026-02-01T00:00:00.000Z')
    ])()

    const states = await committedRowStatesAt({
      streamRepository,
      rowStateRepository: createInMemoryRowStateRepository()(),
      ...registration,
      at: '2026-01-01T00:00:00.000Z'
    })

    expect(states).toEqual([])
  })

  it('resolves the snapshot as of the latest submission at or before the instant', async () => {
    const rowStateRepository = createInMemoryRowStateRepository()()
    await rowStateRepository.upsertRowStates(
      DEFAULT_PARTITION,
      [buildRowStateEntry({ data: { tonnage: 10 } })],
      'log-1'
    )
    await rowStateRepository.upsertRowStates(
      DEFAULT_PARTITION,
      [buildRowStateEntry({ data: { tonnage: 20 } })],
      'log-2'
    )

    const streamRepository = createInMemoryStreamRepository([
      submittedAt(1, 'log-1', '2026-02-01T00:00:00.000Z'),
      submittedAt(2, 'log-2', '2026-03-01T00:00:00.000Z')
    ])()

    const states = await committedRowStatesAt({
      streamRepository,
      rowStateRepository,
      ...registration,
      at: '2026-02-15T00:00:00.000Z'
    })

    expect(states.map((s) => s.data.tonnage)).toEqual([10])
  })

  it('includes a submission committed exactly at the instant', async () => {
    const rowStateRepository = createInMemoryRowStateRepository()()
    await rowStateRepository.upsertRowStates(
      DEFAULT_PARTITION,
      [buildRowStateEntry({ data: { tonnage: 10 } })],
      'log-1'
    )

    const streamRepository = createInMemoryStreamRepository([
      submittedAt(1, 'log-1', '2026-02-01T00:00:00.000Z')
    ])()

    const states = await committedRowStatesAt({
      streamRepository,
      rowStateRepository,
      ...registration,
      at: '2026-02-01T00:00:00.000Z'
    })

    expect(states.map((s) => s.data.tonnage)).toEqual([10])
  })
})

describe('rowHistory', () => {
  const historyFor = (streamRepository, rowStateRepository, overrides = {}) =>
    rowHistory({
      streamRepository,
      rowStateRepository,
      organisationId: 'org-1',
      registrationId: 'reg-1',
      accreditationId: 'acc-1',
      rowId: 'row-1',
      wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
      ...overrides
    })

  it('returns an empty array for a row with no committed states', async () => {
    const history = await historyFor(
      createInMemoryStreamRepository()(),
      createInMemoryRowStateRepository()()
    )

    expect(history).toEqual([])
  })

  it('expands membership into one occurrence per submission, ordered by stream position', async () => {
    const rowStateRepository = createInMemoryRowStateRepository()()
    await rowStateRepository.upsertRowStates(
      DEFAULT_PARTITION,
      [buildRowStateEntry({ data: { tonnage: 10 } })],
      'log-1'
    )
    await rowStateRepository.upsertRowStates(
      DEFAULT_PARTITION,
      [buildRowStateEntry({ data: { tonnage: 20 } })],
      'log-2'
    )
    await rowStateRepository.upsertRowStates(
      DEFAULT_PARTITION,
      [buildRowStateEntry({ data: { tonnage: 10 } })],
      'log-3'
    )

    const streamRepository = createInMemoryStreamRepository([
      submissionEvent(1, 'log-1'),
      submissionEvent(2, 'log-2'),
      submissionEvent(3, 'log-3'),
      buildPrnCreatedEvent({ number: 4 })
    ])()

    const history = await historyFor(streamRepository, rowStateRepository)

    expect(history.map((h) => h.summaryLogId)).toEqual([
      'log-1',
      'log-2',
      'log-3'
    ])
    expect(history.map((h) => h.streamPosition)).toEqual([1, 2, 3])
    expect(history.map((h) => h.data.tonnage)).toEqual([10, 20, 10])
  })

  it('carries each submission classification — whether and why it counted', async () => {
    const rowStateRepository = createInMemoryRowStateRepository()()
    await rowStateRepository.upsertRowStates(
      DEFAULT_PARTITION,
      [buildRowStateEntry()],
      'log-1'
    )
    await rowStateRepository.upsertRowStates(
      DEFAULT_PARTITION,
      [
        buildRowStateEntry({
          classification: {
            outcome: ROW_OUTCOME.EXCLUDED,
            reasons: [{ code: 'PRN_ISSUED' }],
            transactionAmount: 0
          }
        })
      ],
      'log-2'
    )

    const streamRepository = createInMemoryStreamRepository([
      submissionEvent(1, 'log-1'),
      submissionEvent(2, 'log-2')
    ])()

    const history = await historyFor(streamRepository, rowStateRepository)

    expect(history.map((h) => h.classification.outcome)).toEqual([
      ROW_OUTCOME.INCLUDED,
      ROW_OUTCOME.EXCLUDED
    ])
    expect(history[1].classification.reasons).toEqual([{ code: 'PRN_ISSUED' }])
  })

  it('resolves stream positions for a registered-only row', async () => {
    const partition = { ...DEFAULT_PARTITION, accreditationId: null }
    const rowStateRepository = createInMemoryRowStateRepository()()
    await rowStateRepository.upsertRowStates(
      partition,
      [buildRowStateEntry({ data: { tonnage: 10 } })],
      'log-1'
    )

    const streamRepository = createInMemoryStreamRepository([
      { ...submissionEvent(1, 'log-1'), accreditationId: null }
    ])()

    const history = await historyFor(streamRepository, rowStateRepository, {
      accreditationId: null
    })

    expect(history.map((h) => h.streamPosition)).toEqual([1])
  })

  it('scopes history to the requested accreditation partition', async () => {
    const rowStateRepository = createInMemoryRowStateRepository()()
    await rowStateRepository.upsertRowStates(
      { ...DEFAULT_PARTITION, accreditationId: 'acc-1' },
      [buildRowStateEntry({ data: { tonnage: 10 } })],
      'log-1'
    )
    await rowStateRepository.upsertRowStates(
      { ...DEFAULT_PARTITION, accreditationId: null },
      [buildRowStateEntry({ data: { tonnage: 20 } })],
      'log-2'
    )

    const streamRepository = createInMemoryStreamRepository([
      submissionEvent(1, 'log-1'),
      { ...submissionEvent(2, 'log-2'), accreditationId: null }
    ])()

    const accredited = await historyFor(streamRepository, rowStateRepository, {
      accreditationId: 'acc-1'
    })
    const registeredOnly = await historyFor(
      streamRepository,
      rowStateRepository,
      { accreditationId: null }
    )

    expect(accredited.map((h) => h.data.tonnage)).toEqual([10])
    expect(registeredOnly.map((h) => h.data.tonnage)).toEqual([20])
  })

  it('returns empty history when the row exists only under another accreditation', async () => {
    const rowStateRepository = createInMemoryRowStateRepository()()
    await rowStateRepository.upsertRowStates(
      { ...DEFAULT_PARTITION, accreditationId: 'acc-1' },
      [buildRowStateEntry({ data: { tonnage: 10 } })],
      'log-1'
    )

    const streamRepository = createInMemoryStreamRepository([
      submissionEvent(1, 'log-1')
    ])()

    const otherAccreditation = await historyFor(
      streamRepository,
      rowStateRepository,
      { accreditationId: 'acc-2' }
    )
    const registeredOnly = await historyFor(
      streamRepository,
      rowStateRepository,
      { accreditationId: null }
    )

    expect(otherAccreditation).toEqual([])
    expect(registeredOnly).toEqual([])
  })
})
