import { describe, it, expect } from 'vitest'
import { MATERIAL } from '#domain/organisations/model.js'
import {
  accreditationsByYear,
  approvedStatusFrom,
  buildReadAccreditation,
  buildReadOrganisation,
  buildReadReprocessorRegistration
} from '#organisation-read-model/test-support.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { toYear } from '#common/helpers/dates/year.js'
import { toRegistrationNumber } from '#domain/organisations/numbers.js'
import { accreditedMonths } from './accredited-months.js'

/** @import { AccreditationStatus, StatusTimeline } from '#organisation-read-model/domain/model.js' */

const JANUARY_TO_MARCH_2026 = ['2026-01', '2026-02', '2026-03'].map(toYearMonth)

/**
 * @param {AccreditationStatus} status
 * @param {string} at
 */
const then = (status, at) => ({ status, at: new Date(at).toISOString() })

/**
 * @param {string} [approvedAt]
 * @returns {StatusTimeline<AccreditationStatus>}
 */
const grantedFrom = (approvedAt = '2026-01-01') => [
  then('approved', approvedAt)
]

let sequence = 0

/**
 * An organisation holding one reprocessor registration and its accreditation
 * for the year, 2026 unless told otherwise.
 *
 * @param {StatusTimeline<AccreditationStatus>} [timeline]
 * @param {number} [year]
 */
const operatorAccredited = (timeline = grantedFrom(), year = 2026) => {
  sequence += 1
  const last = /** @type {StatusTimeline<AccreditationStatus>[number]} */ (
    timeline.at(-1)
  )
  return buildReadOrganisation({
    registrations: {
      [toRegistrationNumber(`REG-${sequence}`)]:
        buildReadReprocessorRegistration({
          material: MATERIAL.PLASTIC,
          status: approvedStatusFrom('2025-12-01'),
          accreditations: accreditationsByYear(
            buildReadAccreditation({
              status: {
                current: last.status,
                lastUpdatedAt: last.at,
                timeline
              },
              year: toYear(year)
            })
          )
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

  it('yields nothing for an accreditation cancelled at the moment it was approved', () => {
    const cancelledBeforeItStarted = operatorAccredited([
      then('approved', '2026-02-15'),
      then('cancelled', '2026-02-15')
    ])

    expect(monthsOf(cancelledBeforeItStarted)).toEqual([])
  })

  it('leaves out a month whose first day the accreditation was cancelled on, whatever the time', () => {
    const cancelledAtTwo = operatorAccredited([
      ...grantedFrom(),
      then('cancelled', '2026-02-01T14:00:00.000Z')
    ])

    expect(monthsOf(cancelledAtTwo)).toEqual(['2026-01'])
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
    const lastYear = operatorAccredited(grantedFrom('2025-01-01'), 2025)

    expect(monthsOf(lastYear)).toEqual([])
  })

  it('yields only the months of its own year for an accreditation when the months served cross the year end', () => {
    const lastYear = operatorAccredited(grantedFrom('2025-01-01'), 2025)

    const months = [
      ...accreditedMonths({
        organisations: [lastYear],
        months: ['2025-12', '2026-01'].map(toYearMonth)
      })
    ].map(({ month }) => month)

    expect(months).toEqual(['2025-12'])
  })

  it('yields nothing for an accreditation cancelled without being approved', () => {
    const neverApproved = operatorAccredited([then('cancelled', '2026-02-10')])

    expect(monthsOf(neverApproved)).toEqual([])
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
