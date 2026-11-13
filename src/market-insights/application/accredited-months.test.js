import { describe, it, expect } from 'vitest'
import { MATERIAL } from '#domain/organisations/model.js'
import {
  approvedTimelineFrom,
  buildReadAccreditation,
  buildReadOrganisation,
  buildReadReprocessorRegistration
} from '#organisation-read-model/repository/read-model-test-data.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { toRegistrationNumber } from '#domain/organisations/numbers.js'
import { accreditedMonths } from './accredited-months.js'

/** @import { StatusTimeline } from '#organisation-read-model/domain/model.js' */

const JANUARY_TO_MARCH_2026 = ['2026-01', '2026-02', '2026-03'].map(toYearMonth)

/**
 * A status change as the read model times it, taking effect when recorded.
 *
 * @param {string} status
 * @param {string} at
 */
const then = (status, at) => {
  const instant = new Date(at).toISOString()
  return { status, at: instant, updatedAt: instant }
}

/**
 * Created in November, approved in December to take effect from `validFrom`.
 *
 * @param {string} [validFrom]
 * @returns {StatusTimeline}
 */
const grantedFrom = (validFrom = '2026-01-01') => [
  then('created', '2025-11-01'),
  {
    status: 'approved',
    at: new Date(validFrom).toISOString(),
    updatedAt: '2025-12-01T00:00:00.000Z'
  }
]

let sequence = 0

/**
 * An organisation holding one reprocessor registration and its accreditation
 * for the year, 2026 unless told otherwise.
 *
 * @param {StatusTimeline} [timeline]
 * @param {number} [year]
 */
const operatorAccredited = (timeline = grantedFrom(), year = 2026) => {
  sequence += 1
  const current = /** @type {'approved' | 'suspended' | 'cancelled'} */ (
    timeline.at(-1)?.status
  )
  return buildReadOrganisation({
    registrations: {
      [toRegistrationNumber(`REG-${sequence}`)]:
        buildReadReprocessorRegistration({
          material: MATERIAL.PLASTIC,
          validFrom: '2025-12-01',
          status: {
            current: 'approved',
            timeline: approvedTimelineFrom('2025-12-01')
          },
          accreditations: {
            [year]: buildReadAccreditation({ status: { current, timeline } })
          }
        })
    }
  })
}

/** @param {ReturnType<typeof operatorAccredited>} organisation */
const monthsOf = (organisation) =>
  [
    ...accreditedMonths({
      organisations: [organisation],
      months: JANUARY_TO_MARCH_2026
    })
  ].map(({ month }) => month)

describe('accreditedMonths', () => {
  it('yields every month served of an accreditation granted throughout', () => {
    expect(monthsOf(operatorAccredited())).toEqual(JANUARY_TO_MARCH_2026)
  })

  it('yields a month the accreditation stood suspended throughout', () => {
    const suspended = operatorAccredited([
      ...grantedFrom(),
      then('suspended', '2026-01-20')
    ])

    expect(monthsOf(suspended)).toEqual(JANUARY_TO_MARCH_2026)
  })

  it('yields the month an accreditation was cancelled in, and none after', () => {
    const cancelled = operatorAccredited([
      ...grantedFrom(),
      then('cancelled', '2026-02-10')
    ])

    expect(monthsOf(cancelled)).toEqual(['2026-01', '2026-02'])
  })

  it('leaves out a month the accreditation stood cancelled throughout, and yields the month it was reinstated in', () => {
    const reinstated = operatorAccredited([
      ...grantedFrom(),
      then('cancelled', '2026-01-20'),
      then('approved', '2026-03-10')
    ])

    expect(monthsOf(reinstated)).toEqual(['2026-01', '2026-03'])
  })

  it('leaves out the months before the window opens, and yields the month it opens in', () => {
    const partway = operatorAccredited(grantedFrom('2026-02-15'))

    expect(monthsOf(partway)).toEqual(['2026-02', '2026-03'])
  })

  it('yields nothing for the months after the year an accreditation is for', () => {
    const lastYear = operatorAccredited(
      [
        then('created', '2024-11-01'),
        {
          status: 'approved',
          at: '2025-01-01T00:00:00.000Z',
          updatedAt: '2024-12-01T00:00:00.000Z'
        }
      ],
      2025
    )

    expect(monthsOf(lastYear)).toEqual([])
  })

  it('yields the months of a window backdated before the approval', () => {
    const backdated = operatorAccredited([
      then('created', '2025-11-01'),
      {
        status: 'approved',
        at: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-02-15T00:00:00.000Z'
      }
    ])

    expect(monthsOf(backdated)).toEqual(JANUARY_TO_MARCH_2026)
  })

  it('yields nothing for an accreditation cancelled before it starts', () => {
    const cancelled = operatorAccredited([
      ...grantedFrom(),
      {
        status: 'cancelled',
        at: '2026-01-01T00:00:00.000Z',
        updatedAt: '2025-12-15T00:00:00.000Z'
      }
    ])

    expect(monthsOf(cancelled)).toEqual([])
  })

  it('yields nothing for an accreditation reverted to draft, then cancelled with its registration', () => {
    const reverted = operatorAccredited([
      then('created', '2025-11-01'),
      then('approved', '2025-12-01'),
      then('created', '2026-02-01'),
      then('cancelled', '2026-02-10')
    ])

    expect(monthsOf(reverted)).toEqual([])
  })

  it('yields only the registrations the caller covers', () => {
    const covered = operatorAccredited()
    const uncovered = operatorAccredited()

    const months = [
      ...accreditedMonths({
        organisations: [covered, uncovered],
        months: JANUARY_TO_MARCH_2026,
        covers: ({ organisationNumber }) =>
          organisationNumber === covered.organisationNumber
      })
    ]

    expect(months.map(({ organisationNumber }) => organisationNumber)).toEqual(
      JANUARY_TO_MARCH_2026.map(() => covered.organisationNumber)
    )
  })
})
