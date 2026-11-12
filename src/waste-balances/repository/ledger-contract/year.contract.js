import { describe, beforeEach, expect } from 'vitest'

import { buildLedgerEvent, buildLedgerNumbers } from '../ledger-test-data.js'

const LEDGER = buildLedgerNumbers()

export const testYearBehaviour = (it) => {
  describe('year', () => {
    let repository

    beforeEach(async (/** @type {*} */ { ledgerRepository }) => {
      repository = await ledgerRepository()
    })

    it('records the year of each event it appends', async () => {
      await repository.appendEvents([buildLedgerEvent({ ...LEDGER })])

      expect(
        (await repository.findAllInLedger(LEDGER)).map((e) => e.year)
      ).toEqual([2026])
    })

    it('refuses an event without its year, storing nothing', async () => {
      const { year: _year, ...withoutYear } = buildLedgerEvent({ ...LEDGER })

      await expect(repository.appendEvents([withoutYear])).rejects.toThrow(
        'Invalid ledger event data: "year" is required'
      )
      expect(await repository.findLatestInLedger(LEDGER)).toBeNull()
    })
  })
}
