import { describe, beforeEach, expect } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'

import { buildSummaryLogRowStateEntry, withNumbers } from '../test-data.js'

const LEDGER = withNumbers({
  organisationId: 'org-year',
  registrationId: 'reg-year',
  accreditationId: null,
  year: toYear(2026)
})

export const testYearBehaviour = (it) => {
  describe('year', () => {
    let repository

    beforeEach((/** @type {*} */ { summaryLogRowStatesRepository }) => {
      repository = summaryLogRowStatesRepository()
    })

    it('records the year of each row state it stores', async () => {
      const [state] = await repository.upsertSummaryLogRowStates(
        LEDGER,
        [buildSummaryLogRowStateEntry()],
        'log-1'
      )

      expect(state).toMatchObject({ year: 2026 })
    })

    it('rejects a row state without its year', async () => {
      const { year: _year, ...withoutYear } = LEDGER

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
