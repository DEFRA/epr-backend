import { describe, beforeEach, expect } from 'vitest'

import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

import {
  buildRowStateEntry,
  DEFAULT_PARTITION
} from '../row-states-test-data.js'

const excludedClassification = {
  outcome: ROW_OUTCOME.EXCLUDED,
  reasons: [{ code: 'PRN_ISSUED' }],
  transactionAmount: 0
}

export const testUpsertRowStatesBehaviour = (it) => {
  describe('upsertRowStates', () => {
    let repository

    beforeEach((/** @type {*} */ { rowStateRepository }) => {
      repository = rowStateRepository()
    })

    it('inserts a new state document for a previously unseen row', async () => {
      const [state] = await repository.upsertRowStates(
        DEFAULT_PARTITION,
        [buildRowStateEntry()],
        'log-1'
      )

      expect(state.id).toEqual(expect.any(String))
      expect(state.id).not.toBe('')
      expect(state.organisationId).toBe(DEFAULT_PARTITION.organisationId)
      expect(state.registrationId).toBe(DEFAULT_PARTITION.registrationId)
      expect(state.accreditationId).toBe(DEFAULT_PARTITION.accreditationId)
      expect(state.rowId).toBe('row-1')
      expect(state.summaryLogIds).toEqual(['log-1'])
    })

    it('returns one state document per entry, in input order', async () => {
      const states = await repository.upsertRowStates(
        DEFAULT_PARTITION,
        [
          buildRowStateEntry({ rowId: 'row-a' }),
          buildRowStateEntry({ rowId: 'row-b' }),
          buildRowStateEntry({ rowId: 'row-c' })
        ],
        'log-1'
      )

      expect(states.map((s) => s.rowId)).toEqual(['row-a', 'row-b', 'row-c'])
    })

    it('stores a registered-only state with a null accreditationId', async () => {
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

    describe('content-match dedup', () => {
      it('reuses the existing document when an unchanged row recommits, growing membership', async () => {
        const entry = buildRowStateEntry()

        const [first] = await repository.upsertRowStates(
          DEFAULT_PARTITION,
          [entry],
          'log-1'
        )
        const [second] = await repository.upsertRowStates(
          DEFAULT_PARTITION,
          [entry],
          'log-2'
        )

        expect(second.id).toBe(first.id)
        expect(second.summaryLogIds).toEqual(['log-1', 'log-2'])
        expect(
          await repository.findRowHistory(
            'org-1',
            'reg-1',
            'row-1',
            WASTE_RECORD_TYPE.RECEIVED
          )
        ).toHaveLength(1)
      })

      it('inserts a new document when only the row data changes', async () => {
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
        expect(history.map((s) => s.summaryLogIds)).toEqual([
          ['log-1'],
          ['log-2']
        ])
      })

      it('inserts a new document when only the classification changes', async () => {
        await repository.upsertRowStates(
          DEFAULT_PARTITION,
          [buildRowStateEntry()],
          'log-1'
        )
        await repository.upsertRowStates(
          DEFAULT_PARTITION,
          [buildRowStateEntry({ classification: excludedClassification })],
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

      it('reuses the original document when a row reverts A→B→A', async () => {
        const stateA = buildRowStateEntry({ data: { tonnage: 10 } })
        const stateB = buildRowStateEntry({ data: { tonnage: 20 } })

        const [a1] = await repository.upsertRowStates(
          DEFAULT_PARTITION,
          [stateA],
          'log-1'
        )
        await repository.upsertRowStates(DEFAULT_PARTITION, [stateB], 'log-2')
        const [a3] = await repository.upsertRowStates(
          DEFAULT_PARTITION,
          [stateA],
          'log-3'
        )

        expect(a3.id).toBe(a1.id)
        expect(a3.summaryLogIds).toEqual(['log-1', 'log-3'])

        const history = await repository.findRowHistory(
          'org-1',
          'reg-1',
          'row-1',
          WASTE_RECORD_TYPE.RECEIVED
        )
        expect(history).toHaveLength(2)
      })

      it('keeps partitions isolated when deduping identical content', async () => {
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

      it('keeps waste-record types of the same rowId isolated when deduping', async () => {
        const entry = buildRowStateEntry()

        await repository.upsertRowStates(DEFAULT_PARTITION, [entry], 'log-1')
        await repository.upsertRowStates(
          DEFAULT_PARTITION,
          [
            buildRowStateEntry({ wasteRecordType: WASTE_RECORD_TYPE.PROCESSED })
          ],
          'log-1'
        )

        expect(await repository.findBySummaryLogId('log-1')).toHaveLength(2)
      })
    })

    describe('idempotent-upsert', () => {
      it('adds no document and no duplicate membership when a submission is replayed', async () => {
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
    })

    describe('membership-only-grows', () => {
      it('appends new submissions without dropping or reordering earlier ones', async () => {
        const entry = buildRowStateEntry()

        await repository.upsertRowStates(DEFAULT_PARTITION, [entry], 'log-1')
        await repository.upsertRowStates(DEFAULT_PARTITION, [entry], 'log-2')
        const [state] = await repository.upsertRowStates(
          DEFAULT_PARTITION,
          [entry],
          'log-3'
        )

        expect(state.summaryLogIds).toEqual(['log-1', 'log-2', 'log-3'])
      })
    })

    describe('never-mutate', () => {
      it('leaves stored data and classification unchanged across recommits', async () => {
        const entry = buildRowStateEntry({
          data: { supplierName: 'Acme', tonnage: 10 }
        })

        const [first] = await repository.upsertRowStates(
          DEFAULT_PARTITION,
          [entry],
          'log-1'
        )
        await repository.upsertRowStates(DEFAULT_PARTITION, [entry], 'log-2')

        const [stored] = await repository.findRowHistory(
          'org-1',
          'reg-1',
          'row-1',
          WASTE_RECORD_TYPE.RECEIVED
        )
        expect(stored.data).toEqual(first.data)
        expect(stored.classification).toEqual(first.classification)
      })

      it('does not retroactively mutate documents already returned to a caller', async () => {
        const entry = buildRowStateEntry()

        const [first] = await repository.upsertRowStates(
          DEFAULT_PARTITION,
          [entry],
          'log-1'
        )
        await repository.upsertRowStates(DEFAULT_PARTITION, [entry], 'log-2')

        expect(first.summaryLogIds).toEqual(['log-1'])
      })

      it('does not let a mutated caller copy bleed back into storage', async () => {
        const [returned] = await repository.upsertRowStates(
          DEFAULT_PARTITION,
          [buildRowStateEntry()],
          'log-1'
        )
        returned.data.tonnage = 999
        returned.summaryLogIds.push('log-injected')

        const [stored] = await repository.findBySummaryLogId('log-1')
        expect(stored.data.tonnage).toBe(10)
        expect(stored.summaryLogIds).toEqual(['log-1'])
      })
    })
  })
}
