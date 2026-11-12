import { describe, beforeEach, expect } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'

import {
  buildLedgerEvent,
  buildLedgerNumbers,
  buildPrnCreatedEvent
} from '../ledger-test-data.js'

const YEAR_2026 = toYear(2026)
const YEAR_2027 = toYear(2027)

/**
 * The same registration's ledgers in two years, registered-only and
 * accredited.
 */
const LEDGERS = Object.freeze({
  registeredOnly: Object.freeze({
    2026: buildLedgerNumbers({ accreditationId: null, year: YEAR_2026 }),
    2027: buildLedgerNumbers({ accreditationId: null, year: YEAR_2027 })
  }),
  accredited: Object.freeze({
    2026: buildLedgerNumbers({ year: YEAR_2026 }),
    2027: buildLedgerNumbers({ year: YEAR_2027 })
  })
})

export const testYearBehaviour = (it) => {
  describe('year', () => {
    let repository

    beforeEach(async (/** @type {*} */ { ledgerRepository }) => {
      repository = await ledgerRepository()
    })

    describe.each(Object.entries(LEDGERS))('a %s ledger', (_, byYear) => {
      it('starts each year at slot 1', async () => {
        await repository.appendEvents([
          buildLedgerEvent({ ...byYear[2026], number: 1 })
        ])
        await repository.appendEvents([
          buildLedgerEvent({ ...byYear[2027], number: 1 })
        ])

        expect(
          (await repository.findAllInLedger(byYear[2026])).map((e) => e.year)
        ).toEqual([2026])
        expect(
          (await repository.findAllInLedger(byYear[2027])).map((e) => e.year)
        ).toEqual([2027])
      })

      it("keeps each year's balance apart", async () => {
        await repository.appendEvents([
          buildLedgerEvent({
            ...byYear[2026],
            payload: { summaryLogId: 'log-2026', creditTotal: 100 },
            closingBalance: { amount: 100, availableAmount: 100 }
          })
        ])
        await repository.appendEvents([
          buildLedgerEvent({
            ...byYear[2027],
            payload: { summaryLogId: 'log-2027', creditTotal: 30 },
            closingBalance: { amount: 30, availableAmount: 30 }
          })
        ])

        expect(
          (await repository.findLatestInLedger(byYear[2026])).closingBalance
        ).toEqual({ amount: 100, availableAmount: 100 })
        expect(
          (await repository.findLatestInLedger(byYear[2027])).closingBalance
        ).toEqual({ amount: 30, availableAmount: 30 })
        expect(
          await repository.findLatestInLedgers([byYear[2026], byYear[2027]])
        ).toHaveLength(2)
      })

      it('reports the latest submitted summary log of each year', async () => {
        await repository.appendEvents([
          buildLedgerEvent({
            ...byYear[2026],
            payload: { summaryLogId: 'log-2026', creditTotal: 100 }
          })
        ])
        await repository.appendEvents([
          buildLedgerEvent({
            ...byYear[2027],
            payload: { summaryLogId: 'log-2027', creditTotal: 30 }
          })
        ])

        expect(
          await repository.findLatestSubmittedSummaryLogPerLedger()
        ).toEqual(
          expect.arrayContaining([
            { ledgerId: byYear[2026], summaryLogId: 'log-2026' },
            { ledgerId: byYear[2027], summaryLogId: 'log-2027' }
          ])
        )
      })

      it("deletes one year's events and leaves the other's", async () => {
        await repository.appendEvents([buildLedgerEvent({ ...byYear[2026] })])
        await repository.appendEvents([buildLedgerEvent({ ...byYear[2027] })])

        expect(await repository.deleteAllInLedger(byYear[2026])).toBe(1)
        expect(await repository.findAllInLedger(byYear[2027])).toHaveLength(1)
      })
    })

    it("finds a PRN's events only in its own year", async () => {
      await repository.appendEvents([
        buildPrnCreatedEvent({ ...LEDGERS.accredited[2026] })
      ])
      await repository.appendEvents([
        buildPrnCreatedEvent({ ...LEDGERS.accredited[2027] })
      ])

      expect(
        await repository.findEventsByPrnIdAfter(
          LEDGERS.accredited[2027],
          'prn-1',
          0
        )
      ).toEqual([expect.objectContaining({ year: 2027 })])
      expect(
        await repository.findLatestInLedgerByKind(
          LEDGERS.accredited[2026],
          'prn-created'
        )
      ).toMatchObject({ year: 2026 })
    })

    it('refuses an event without its year, storing nothing', async () => {
      const { year: _year, ...withoutYear } = buildLedgerEvent({
        ...LEDGERS.accredited[2026]
      })

      await expect(repository.appendEvents([withoutYear])).rejects.toThrow(
        'Invalid ledger event data: "year" is required'
      )
      expect(
        await repository.findLatestInLedger(LEDGERS.accredited[2026])
      ).toBeNull()
    })
  })
}
