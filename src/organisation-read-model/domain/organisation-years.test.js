import { toYear } from '#common/helpers/dates/year.js'
import { organisationYears } from './organisation-years.js'

/** @import { RegistrationStatus, StatusTimeline } from './model.js' */

/** @param {...StatusTimeline<RegistrationStatus>} timelines */
const organisationOf = (...timelines) => ({
  registrations: Object.fromEntries(
    timelines.map((timeline, index) => [`R${index}`, { status: { timeline } }])
  )
})

const UP_TO_2027 = toYear(2027)

describe('organisationYears', () => {
  it('lists the current year for a registration approved this year', () => {
    const organisation = organisationOf([
      { status: 'approved', at: '2027-01-10T00:00:00.000Z' }
    ])

    expect(organisationYears(organisation, UP_TO_2027)).toEqual([2027])
  })

  it('lists every year from approval to now while it stays approved', () => {
    const organisation = organisationOf([
      { status: 'approved', at: '2025-02-01T00:00:00.000Z' }
    ])

    expect(organisationYears(organisation, UP_TO_2027)).toEqual([
      2027, 2026, 2025
    ])
  })

  it('stops at the year of cancellation', () => {
    const organisation = organisationOf([
      { status: 'approved', at: '2025-02-01T00:00:00.000Z' },
      { status: 'cancelled', at: '2026-03-01T00:00:00.000Z' }
    ])

    expect(organisationYears(organisation, UP_TO_2027)).toEqual([2026, 2025])
  })

  it('does not list the year when cancelled on the first of January', () => {
    const organisation = organisationOf([
      { status: 'approved', at: '2025-02-01T00:00:00.000Z' },
      { status: 'cancelled', at: '2026-01-01T00:00:00.000Z' }
    ])

    expect(organisationYears(organisation, UP_TO_2027)).toEqual([2025])
  })

  it('skips the years between a cancellation and a reinstatement', () => {
    const organisation = organisationOf([
      { status: 'approved', at: '2024-02-01T00:00:00.000Z' },
      { status: 'cancelled', at: '2024-06-01T00:00:00.000Z' },
      { status: 'approved', at: '2026-09-01T00:00:00.000Z' }
    ])

    expect(organisationYears(organisation, UP_TO_2027)).toEqual([
      2027, 2026, 2024
    ])
  })

  it('does not list a year the approval has not reached', () => {
    const organisation = organisationOf([
      { status: 'approved', at: '2028-01-01T00:00:00.000Z' }
    ])

    expect(organisationYears(organisation, UP_TO_2027)).toEqual([])
  })

  it('merges registrations without duplicates, newest first', () => {
    const organisation = organisationOf(
      [{ status: 'approved', at: '2026-02-01T00:00:00.000Z' }],
      [
        { status: 'approved', at: '2025-02-01T00:00:00.000Z' },
        { status: 'cancelled', at: '2026-12-01T00:00:00.000Z' }
      ]
    )

    expect(organisationYears(organisation, UP_TO_2027)).toStrictEqual([
      2027, 2026, 2025
    ])
  })

  it('lists nothing when there are no registrations', () => {
    expect(organisationYears(organisationOf(), UP_TO_2027)).toEqual([])
  })
})
