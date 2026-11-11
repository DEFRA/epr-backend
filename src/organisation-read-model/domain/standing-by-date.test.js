import { toYear } from '#common/helpers/dates/year.js'
import { standingByDate } from './standing-by-date.js'

/** @import { Registration, StatusTimeline } from './model.js' */

/**
 * @param {string} status
 * @returns {(date: string, time?: string) => StatusTimeline[number]}
 */
const changeTo =
  (status) =>
  (date, time = '00:00') => ({ status, at: `${date}T${time}:00.000Z` })

const createdOn = changeTo('created')
const approvedOn = changeTo('approved')
const suspendedOn = changeTo('suspended')
const cancelledOn = changeTo('cancelled')

/**
 * @param {StatusTimeline} registration
 * @param {Record<number, StatusTimeline>} accreditations
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
 * @param {StatusTimeline} registration
 * @param {Record<number, StatusTimeline>} [accreditations]
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
          createdOn('2026-03-01'),
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
    expect(byDate([createdOn('2026-01-10'), approvedOn('2026-02-01')])).toEqual(
      { '2026-02-01': registeredOnly }
    )
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
