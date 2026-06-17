import { describe, it, expect } from 'vitest'

import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

import { createInMemoryRowStateRepository } from './row-states-inmemory.js'
import {
  buildRowStateEntry,
  DEFAULT_PARTITION
} from './row-states-test-data.js'

const newRepository = (initial = []) =>
  createInMemoryRowStateRepository(initial)()

describe('committed row-states repository - in-memory implementation', () => {
  it('exposes the row-state port surface', () => {
    const repository = newRepository()
    expect(repository.upsertRowStates).toBeTypeOf('function')
    expect(repository.findBySummaryLogId).toBeTypeOf('function')
    expect(repository.findRowHistory).toBeTypeOf('function')
  })

  it('inserts a new state document for a previously unseen row', async () => {
    const repository = newRepository()

    const [state] = await repository.upsertRowStates(
      DEFAULT_PARTITION,
      [buildRowStateEntry()],
      'log-1'
    )

    expect(state.id).toBeTypeOf('string')
    expect(state.organisationId).toBe(DEFAULT_PARTITION.organisationId)
    expect(state.summaryLogIds).toEqual(['log-1'])

    const committed = await repository.findBySummaryLogId('log-1')
    expect(committed).toHaveLength(1)
    expect(committed[0].rowId).toBe('row-1')
  })

  it('grows membership when an unchanged row recommits in a later submission', async () => {
    const repository = newRepository()
    const entry = buildRowStateEntry()

    await repository.upsertRowStates(DEFAULT_PARTITION, [entry], 'log-1')
    const [state] = await repository.upsertRowStates(
      DEFAULT_PARTITION,
      [entry],
      'log-2'
    )

    expect(state.summaryLogIds).toEqual(['log-1', 'log-2'])
    expect(
      await repository.findRowHistory(
        'org-1',
        'reg-1',
        'row-1',
        WASTE_RECORD_TYPE.RECEIVED
      )
    ).toHaveLength(1)
  })

  it('inserts a new document when a row changes its data', async () => {
    const repository = newRepository()

    await repository.upsertRowStates(
      DEFAULT_PARTITION,
      [buildRowStateEntry({ data: { tonnage: 10 } })],
      'log-1'
    )
    await repository.upsertRowStates(
      DEFAULT_PARTITION,
      [buildRowStateEntry({ data: { tonnage: 20 } })],
      'log-2'
    )

    const history = await repository.findRowHistory(
      'org-1',
      'reg-1',
      'row-1',
      WASTE_RECORD_TYPE.RECEIVED
    )
    expect(history).toHaveLength(2)
    expect(history.map((s) => s.summaryLogIds)).toEqual([['log-1'], ['log-2']])
  })

  it('inserts a new document when only the classification changes', async () => {
    const repository = newRepository()

    await repository.upsertRowStates(
      DEFAULT_PARTITION,
      [buildRowStateEntry()],
      'log-1'
    )
    await repository.upsertRowStates(
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

    expect(
      await repository.findRowHistory(
        'org-1',
        'reg-1',
        'row-1',
        WASTE_RECORD_TYPE.RECEIVED
      )
    ).toHaveLength(2)
  })

  it('is idempotent — re-running a submission adds no document and no duplicate membership', async () => {
    const repository = newRepository()
    const entry = buildRowStateEntry()

    await repository.upsertRowStates(DEFAULT_PARTITION, [entry], 'log-1')
    const [state] = await repository.upsertRowStates(
      DEFAULT_PARTITION,
      [entry],
      'log-1'
    )

    expect(state.summaryLogIds).toEqual(['log-1'])
    expect(
      await repository.findRowHistory(
        'org-1',
        'reg-1',
        'row-1',
        WASTE_RECORD_TYPE.RECEIVED
      )
    ).toHaveLength(1)
  })

  it('findBySummaryLogId returns only documents whose membership contains the id', async () => {
    const repository = newRepository()

    await repository.upsertRowStates(
      DEFAULT_PARTITION,
      [
        buildRowStateEntry({ rowId: 'row-1' }),
        buildRowStateEntry({ rowId: 'row-2' })
      ],
      'log-1'
    )
    await repository.upsertRowStates(
      DEFAULT_PARTITION,
      [buildRowStateEntry({ rowId: 'row-1', data: { tonnage: 99 } })],
      'log-2'
    )

    const atLog2 = await repository.findBySummaryLogId('log-2')
    expect(atLog2).toHaveLength(1)
    expect(atLog2[0].data).toEqual({ tonnage: 99 })
  })

  it('keeps partitions isolated when deduping', async () => {
    const repository = newRepository()
    const entry = buildRowStateEntry()

    await repository.upsertRowStates(DEFAULT_PARTITION, [entry], 'log-1')
    await repository.upsertRowStates(
      {
        organisationId: 'org-1',
        registrationId: 'reg-2',
        accreditationId: 'acc-1'
      },
      [entry],
      'log-2'
    )

    expect(await repository.findBySummaryLogId('log-1')).toHaveLength(1)
    expect(await repository.findBySummaryLogId('log-2')).toHaveLength(1)
  })

  it('handles registered-only partitions with a null accreditationId', async () => {
    const repository = newRepository()

    const [state] = await repository.upsertRowStates(
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        accreditationId: null
      },
      [buildRowStateEntry()],
      'log-1'
    )

    expect(state.accreditationId).toBeNull()
  })

  it('returns row history in insertion order', async () => {
    const repository = newRepository()

    await repository.upsertRowStates(
      DEFAULT_PARTITION,
      [buildRowStateEntry({ data: { tonnage: 1 } })],
      'log-1'
    )
    await repository.upsertRowStates(
      DEFAULT_PARTITION,
      [buildRowStateEntry({ data: { tonnage: 2 } })],
      'log-2'
    )
    await repository.upsertRowStates(
      DEFAULT_PARTITION,
      [buildRowStateEntry({ data: { tonnage: 3 } })],
      'log-3'
    )

    const history = await repository.findRowHistory(
      'org-1',
      'reg-1',
      'row-1',
      WASTE_RECORD_TYPE.RECEIVED
    )
    expect(history.map((s) => s.data.tonnage)).toEqual([1, 2, 3])
  })

  it('does not mutate stored documents returned to earlier callers', async () => {
    const repository = newRepository()
    const entry = buildRowStateEntry()

    const [first] = await repository.upsertRowStates(
      DEFAULT_PARTITION,
      [entry],
      'log-1'
    )
    await repository.upsertRowStates(DEFAULT_PARTITION, [entry], 'log-2')

    expect(first.summaryLogIds).toEqual(['log-1'])
  })
})
