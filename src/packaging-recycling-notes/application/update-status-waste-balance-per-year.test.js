import assert from 'node:assert/strict'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import {
  PRN_ACTOR,
  PRN_STATUS
} from '#packaging-recycling-notes/domain/model.js'
import { RelevantYearWindowExpiredError } from '#packaging-recycling-notes/domain/relevant-year.js'
import {
  buildAccreditationSnapshot,
  buildDraftPrn
} from '#packaging-recycling-notes/repository/contract/test-data.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { createMockLogger } from '#test/mock-logger.js'
import { toSummaryLogFileId } from '#domain/summary-logs/ids.js'

import { readRepositoryHolding } from './issuing-accreditation-test-helpers.js'

vi.mock('./metrics.js', () => ({
  prnMetrics: {
    recordStatusTransition: vi.fn().mockResolvedValue(undefined)
  }
}))

const { updatePrnStatus: updatePrnStatusUntyped } =
  await import('./update-status.js')
const updatePrnStatus =
  /** @type {typeof import('./update-status.js').updatePrnStatus} */ (
    updatePrnStatusUntyped
  )

/** @import { Year } from '#common/helpers/dates/year.js' */

const ORGANISATION_NUMBER = toOrganisationNumber('500123')
const REGISTRATION_NUMBER = toRegistrationNumber('R26ER5001230456PA')
const YEAR_2026 = toYear(2026)
const YEAR_2027 = toYear(2027)
const TONNAGE = 50

/** @type {Record<number, { year: Year, accreditationNumber: import('#domain/organisations/numbers.js').AccreditationNumber, opening: number, prnId: string }>} */
const YEARS = {
  2026: {
    year: YEAR_2026,
    accreditationNumber: toAccreditationNumber('A26ER5001230456PA'),
    opening: 1000,
    prnId: '507f1f77bcf86cd799439026'
  },
  2027: {
    year: YEAR_2027,
    accreditationNumber: toAccreditationNumber('A27ER5001230456PA'),
    opening: 400,
    prnId: '507f1f77bcf86cd799439027'
  }
}

/** @param {number} year */
const ledgerIdOf = (year) => ({
  organisationNumber: ORGANISATION_NUMBER,
  registrationNumber: REGISTRATION_NUMBER,
  accreditationNumber: YEARS[year].accreditationNumber,
  year: YEARS[year].year
})

/** @param {number} year */
const draftPrnFor = (year) => ({
  ...buildDraftPrn({
    organisation: {
      organisationNumber: ORGANISATION_NUMBER,
      name: 'Test Reprocessor',
      tradingName: 'Trading Name'
    },
    registration: { registrationNumber: REGISTRATION_NUMBER },
    accreditation: buildAccreditationSnapshot({
      accreditationNumber: YEARS[year].accreditationNumber,
      accreditationYear: YEARS[year].year
    }),
    tonnage: TONNAGE
  }),
  id: YEARS[year].prnId
})

const setup = async () => {
  const logger = createMockLogger()
  const prnRepository = createInMemoryPackagingRecyclingNotesRepository([
    draftPrnFor(2026),
    draftPrnFor(2027)
  ])(logger)

  const ledgerRepository = createInMemoryLedgerRepository()()
  for (const year of [2026, 2027]) {
    await ledgerRepository.appendEvents([
      buildLedgerEvent({
        ...ledgerIdOf(year),
        payload: {
          summaryLogId: toSummaryLogFileId(`log-${year}`),
          creditTotal: YEARS[year].opening
        },
        closingBalance: {
          amount: YEARS[year].opening,
          availableAmount: YEARS[year].opening
        }
      })
    ])
  }

  const organisationReadRepository = readRepositoryHolding({
    ...ledgerIdOf(2026),
    alsoHeld: [ledgerIdOf(2027)]
  })

  /**
   * @param {number} year
   * @param {import('#packaging-recycling-notes/domain/model.js').PrnStatus} newStatus
   * @param {import('#packaging-recycling-notes/domain/model.js').PrnActor} actor
   */
  const moveTo = (year, newStatus, actor) =>
    updatePrnStatus({
      prnRepository,
      ledgerRepository,
      organisationReadRepository,
      prnEvents: { onCancelled: vi.fn().mockResolvedValue(undefined) },
      logger,
      id: YEARS[year].prnId,
      accreditationNumbers: ledgerIdOf(year),
      newStatus,
      actor,
      user: { id: 'user-789', name: 'Test User' }
    })

  /** @param {number} year */
  const balanceOf = async (year) => {
    const latest = await ledgerRepository.findLatestInLedger(ledgerIdOf(year))
    assert(latest)
    return latest.closingBalance
  }

  return { moveTo, balanceOf }
}

describe("a PRN draws only on its own year's waste balance", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('while both years are open', () => {
    beforeEach(() => {
      vi.setSystemTime(new Date('2027-01-15T12:00:00.000Z'))
    })

    it.each([
      { year: 2026, other: 2027 },
      { year: 2027, other: 2026 }
    ])(
      'raising and issuing a $year PRN leaves $other alone',
      async ({ year, other }) => {
        const { moveTo, balanceOf } = await setup()
        const opening = YEARS[year].opening
        const untouched = {
          amount: YEARS[other].opening,
          availableAmount: YEARS[other].opening
        }

        await moveTo(
          year,
          PRN_STATUS.AWAITING_AUTHORISATION,
          PRN_ACTOR.REPROCESSOR_EXPORTER
        )

        expect(await balanceOf(year)).toEqual({
          amount: opening,
          availableAmount: opening - TONNAGE
        })
        expect(await balanceOf(other)).toEqual(untouched)

        await moveTo(year, PRN_STATUS.AWAITING_ACCEPTANCE, PRN_ACTOR.SIGNATORY)

        expect(await balanceOf(year)).toEqual({
          amount: opening - TONNAGE,
          availableAmount: opening - TONNAGE
        })
        expect(await balanceOf(other)).toEqual(untouched)
      }
    )
  })

  describe('once 2026 has closed', () => {
    beforeEach(() => {
      vi.setSystemTime(new Date('2027-02-01T00:00:00.000Z'))
    })

    it('refuses a 2026 PRN and leaves both years alone', async () => {
      const { moveTo, balanceOf } = await setup()

      await expect(
        moveTo(
          2026,
          PRN_STATUS.AWAITING_AUTHORISATION,
          PRN_ACTOR.REPROCESSOR_EXPORTER
        )
      ).rejects.toBeInstanceOf(RelevantYearWindowExpiredError)

      expect(await balanceOf(2026)).toEqual({
        amount: 1000,
        availableAmount: 1000
      })
      expect(await balanceOf(2027)).toEqual({
        amount: 400,
        availableAmount: 400
      })
    })

    it('still raises a 2027 PRN and leaves 2026 alone', async () => {
      const { moveTo, balanceOf } = await setup()

      await moveTo(
        2027,
        PRN_STATUS.AWAITING_AUTHORISATION,
        PRN_ACTOR.REPROCESSOR_EXPORTER
      )

      expect(await balanceOf(2027)).toEqual({
        amount: 400,
        availableAmount: 400 - TONNAGE
      })
      expect(await balanceOf(2026)).toEqual({
        amount: 1000,
        availableAmount: 1000
      })
    })
  })
})
