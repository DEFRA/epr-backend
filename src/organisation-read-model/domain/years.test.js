import { partialMock } from '#test/type-helpers.js'
import { organisationYears } from './years.js'

const registration = (statusTimeline) => partialMock({ statusTimeline })

const organisationOf = (...timelines) =>
  partialMock({
    registrations: Object.fromEntries(
      timelines.map((timeline, index) => [`R${index}`, registration(timeline)])
    )
  })

const NOW = new Date('2027-03-15T10:00:00.000Z')

describe('organisationYears', () => {
  it('lists the current year for a registration approved this year', () => {
    const organisation = organisationOf({
      '2027-01-10': { status: 'approved' }
    })

    expect(organisationYears(organisation, NOW)).toEqual([2027])
  })

  it('lists every year from approval to now while it stays approved', () => {
    const organisation = organisationOf({
      '2025-02-01': { status: 'approved' }
    })

    expect(organisationYears(organisation, NOW)).toEqual([2027, 2026, 2025])
  })

  it('stops at the year of cancellation', () => {
    const organisation = organisationOf({
      '2025-02-01': { status: 'approved' },
      '2026-03-01': { status: 'cancelled' }
    })

    expect(organisationYears(organisation, NOW)).toEqual([2026, 2025])
  })

  it('does not list the year when cancelled on the first of January', () => {
    const organisation = organisationOf({
      '2025-02-01': { status: 'approved' },
      '2026-01-01': { status: 'cancelled' }
    })

    expect(organisationYears(organisation, NOW)).toEqual([2025])
  })

  it('skips the years between a cancellation and a reinstatement', () => {
    const organisation = organisationOf({
      '2024-02-01': { status: 'approved' },
      '2024-06-01': { status: 'cancelled' },
      '2026-09-01': { status: 'approved' }
    })

    expect(organisationYears(organisation, NOW)).toEqual([2027, 2026, 2024])
  })

  it('does not list a year the approval has not reached', () => {
    const organisation = organisationOf({
      '2028-01-01': { status: 'approved' }
    })

    expect(organisationYears(organisation, NOW)).toEqual([])
  })

  it('merges registrations without duplicates, newest first', () => {
    const organisation = organisationOf(
      { '2026-02-01': { status: 'approved' } },
      {
        '2025-02-01': { status: 'approved' },
        '2025-12-01': { status: 'cancelled' }
      }
    )

    expect(organisationYears(organisation, NOW)).toEqual([2027, 2026, 2025])
  })

  it('lists nothing when there are no registrations', () => {
    expect(organisationYears(partialMock({ registrations: {} }), NOW)).toEqual(
      []
    )
  })
})
