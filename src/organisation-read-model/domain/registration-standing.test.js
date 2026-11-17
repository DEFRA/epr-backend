import { toYear } from '#common/helpers/dates/year.js'
import { partialMock } from '#test/type-helpers.js'
import { standingByDate, standingByYear } from './registration-standing.js'

/** @import { AccreditationStatus, Registration, RegistrationStatus, StatusTimeline } from './model.js' */

/**
 * @template {string} S
 * @param {S} status
 * @returns {(date: string, time?: string) => StatusTimeline<S>[number]}
 */
const changeTo =
  (status) =>
  (date, time = '00:00') => ({ status, at: `${date}T${time}:00.000Z` })

const approvedOn = changeTo('approved')
const suspendedOn = changeTo('suspended')
const cancelledOn = changeTo('cancelled')

/**
 * @param {StatusTimeline<RegistrationStatus>} registration
 * @param {Record<number, StatusTimeline<AccreditationStatus>>} accreditations
 * @returns {Registration}
 */
const registrationWith = (registration, accreditations) =>
  /** @type {Registration} */ (
    /** @type {unknown} */ ({
      status: { timeline: registration },
      accreditations: Object.fromEntries(
        Object.entries(accreditations).map(([key, timeline]) => [
          key,
          { status: { timeline } }
        ])
      )
    })
  )

/**
 * @param {StatusTimeline<RegistrationStatus>} registration
 * @param {Record<number, StatusTimeline<AccreditationStatus>>} [accreditations]
 * @param {number} [year]
 */
const byDate = (registration, accreditations = {}, year = 2026) =>
  standingByDate(registrationWith(registration, accreditations), toYear(year))

const registeredOnly = { standing: 'registeredOnly' }
const accredited = { standing: 'accredited' }
const cancelled = { standing: 'cancelled' }

describe('standingByDate', () => {
  it('starts each status on the date it changes', () => {
    expect(
      byDate([approvedOn('2026-02-01'), cancelledOn('2026-11-20')], {
        2026: [
          approvedOn('2026-07-01'),
          suspendedOn('2026-09-01'),
          cancelledOn('2026-10-15')
        ]
      })
    ).toEqual({
      '2026-02-01': registeredOnly,
      '2026-07-01': accredited,
      '2026-10-15': registeredOnly,
      '2026-11-20': cancelled
    })
  })

  it('has no key before the registration is first approved', () => {
    expect(byDate([approvedOn('2026-02-01')])).toEqual({
      '2026-02-01': registeredOnly
    })
  })

  it('is empty for a year before registration', () => {
    expect(byDate([approvedOn('2027-02-01')])).toEqual({})
  })

  it('opens a registration carried over from last year on 1 January', () => {
    expect(byDate([approvedOn('2025-06-02')])).toEqual({
      '2026-01-01': registeredOnly
    })
  })

  it('opens on 1 January as cancelled when cancelled going into the year', () => {
    expect(
      byDate([
        approvedOn('2025-06-02'),
        cancelledOn('2025-09-01'),
        approvedOn('2026-03-01')
      ])
    ).toEqual({
      '2026-01-01': cancelled,
      '2026-03-01': registeredOnly
    })
  })

  it('adds no key for a suspension, which still holds the accreditation', () => {
    expect(
      byDate([approvedOn('2025-06-02')], {
        2026: [
          approvedOn('2026-01-01'),
          suspendedOn('2026-04-01'),
          approvedOn('2026-05-01')
        ]
      })
    ).toEqual({ '2026-01-01': accredited })
  })

  it('adds no key for a cancellation and reinstatement on one day', () => {
    expect(
      byDate([
        approvedOn('2025-06-02'),
        cancelledOn('2026-04-01', '09:00'),
        approvedOn('2026-04-01', '15:00')
      ])
    ).toEqual({ '2026-01-01': registeredOnly })
  })

  it('takes the last of several changes on one day', () => {
    expect(
      byDate([
        approvedOn('2025-06-02'),
        approvedOn('2026-04-01', '09:00'),
        cancelledOn('2026-04-01', '15:00')
      ])
    ).toEqual({
      '2026-01-01': registeredOnly,
      '2026-04-01': cancelled
    })
  })

  it('is accredited only from registration when accredited before registering', () => {
    expect(
      byDate([approvedOn('2026-03-01')], { 2026: [approvedOn('2026-01-01')] })
    ).toEqual({ '2026-03-01': accredited })
  })

  it('is cancelled, not registered-only, when both are cancelled together', () => {
    expect(
      byDate([approvedOn('2025-06-02'), cancelledOn('2026-08-01')], {
        2026: [approvedOn('2026-01-01'), cancelledOn('2026-08-01')]
      })
    ).toEqual({
      '2026-01-01': accredited,
      '2026-08-01': cancelled
    })
  })

  it('stays accredited after a cancellation dated after the year', () => {
    expect(
      byDate([approvedOn('2025-06-02')], {
        2026: [approvedOn('2026-01-01'), cancelledOn('2027-01-15')]
      })
    ).toEqual({ '2026-01-01': accredited })
  })

  it('counts only the accreditation for the given year', () => {
    expect(
      byDate([approvedOn('2025-06-02')], { 2025: [approvedOn('2025-07-01')] })
    ).toEqual({ '2026-01-01': registeredOnly })
  })
})

describe('standingByYear', () => {
  const UP_TO_2026 = toYear(2026)
  const registeredOnly = { standing: 'registeredOnly' }
  const accredited = { standing: 'accredited' }
  const approvedFrom = (date, accreditations = {}) => ({
    status: {
      current: /** @type {const} */ ('approved'),
      lastUpdatedAt: approvedOn(date).at,
      timeline: [approvedOn(date)]
    },
    accreditations
  })
  /** @param {StatusTimeline<RegistrationStatus>} timeline */
  const registration = (timeline) => partialMock({ status: { timeline } })

  it('covers each year from approval up to the year given', () => {
    expect(
      standingByYear(partialMock(approvedFrom('2025-06-02')), UP_TO_2026)
    ).toEqual({
      2025: { '2025-06-02': registeredOnly },
      2026: { '2026-01-01': registeredOnly }
    })
  })

  it('leaves out a year spent wholly cancelled', () => {
    const timeline = [
      approvedOn('2024-06-02'),
      cancelledOn('2024-09-01'),
      approvedOn('2026-03-01')
    ]

    expect(
      Object.keys(
        standingByYear(
          partialMock({ ...registration(timeline), accreditations: {} }),
          UP_TO_2026
        )
      )
    ).toEqual(['2024', '2026'])
  })

  it('covers the year of an accreditation up to the year given', () => {
    const withAccreditationFor2027 = partialMock(
      approvedFrom('2026-06-02', {
        2027: { ...approvedFrom('2026-10-01'), year: toYear(2027) }
      })
    )

    expect(standingByYear(withAccreditationFor2027, UP_TO_2026)).toEqual({
      2026: { '2026-06-02': registeredOnly }
    })
    expect(standingByYear(withAccreditationFor2027, toYear(2027))).toEqual({
      2026: { '2026-06-02': registeredOnly },
      2027: { '2027-01-01': accredited }
    })
  })

  it('is empty for a registration approved after the end date', () => {
    const timeline = [approvedOn('2027-03-01')]

    expect(
      standingByYear(
        partialMock({ ...registration(timeline), accreditations: {} }),
        UP_TO_2026
      )
    ).toEqual({})
  })
})
