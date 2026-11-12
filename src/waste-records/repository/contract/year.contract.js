import { describe, beforeEach, expect } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'

import { buildSummaryLogRowStateEntry, withNumbers } from '../test-data.js'

const LEDGER_2026 = withNumbers({
  organisationId: 'org-year',
  registrationId: 'reg-year',
  accreditationId: null,
  year: toYear(2026)
})

const LEDGER_2027 = { ...LEDGER_2026, year: toYear(2027) }

export const testYearBehaviour = (it) => {
  describe('year', () => {
    let repository

    beforeEach((/** @type {*} */ { summaryLogRowStatesRepository }) => {
      repository = summaryLogRowStatesRepository()
    })

    it('stores identical rows of two years as two row states', async () => {
      const entry = buildSummaryLogRowStateEntry()

      const [state2026] = await repository.upsertSummaryLogRowStates(
        LEDGER_2026,
        [entry],
        'log-2026'
      )
      const [state2027] = await repository.upsertSummaryLogRowStates(
        LEDGER_2027,
        [entry],
        'log-2027'
      )

      expect(state2026.id).not.toBe(state2027.id)
      expect(state2026).toMatchObject({
        year: 2026,
        summaryLogIds: ['log-2026']
      })
      expect(state2027).toMatchObject({
        year: 2027,
        summaryLogIds: ['log-2027']
      })
    })

    it('reads each year back on its own', async () => {
      const entry = buildSummaryLogRowStateEntry()
      await repository.upsertSummaryLogRowStates(LEDGER_2026, [entry], 'log-1')
      await repository.upsertSummaryLogRowStates(LEDGER_2027, [entry], 'log-1')

      expect(
        await repository.findWasteRecordStatesForSummaryLog(
          LEDGER_2026,
          'log-1'
        )
      ).toHaveLength(1)
      expect(
        await repository.findWasteRecordStatesForSummaryLog(
          { ...LEDGER_2026, year: toYear(2028) },
          'log-1'
        )
      ).toEqual([])
    })

    it('streams each row state with its year', async () => {
      await repository.upsertSummaryLogRowStates(
        LEDGER_2027,
        [buildSummaryLogRowStateEntry()],
        'log-2027'
      )

      const streamed = []
      for await (const row of repository.streamRowStatesForSummaryLogs([
        'log-2027'
      ])) {
        streamed.push(row)
      }

      expect(streamed).toEqual([expect.objectContaining({ year: 2027 })])
    })

    it('rejects a row state without its year', async () => {
      const { year: _year, ...withoutYear } = LEDGER_2026

      await expect(
        repository.upsertSummaryLogRowStates(
          withoutYear,
          [buildSummaryLogRowStateEntry()],
          'log-1'
        )
      ).rejects.toThrow('"year" is required')
    })
  })
}
