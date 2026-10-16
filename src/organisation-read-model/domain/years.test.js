import { partialMock } from '#test/type-helpers.js'
import { organisationInYear, organisationYears } from './years.js'

const registration = (timeline) => partialMock({ status: { timeline } })

const organisationOf = (...timelines) =>
  partialMock({
    registrations: Object.fromEntries(
      timelines.map((timeline, index) => [`R${index}`, registration(timeline)])
    )
  })

const NOW = new Date('2027-03-15T10:00:00.000Z')

describe('organisationYears', () => {
  it('lists the current year for a registration approved this year', () => {
    const organisation = organisationOf([
      { status: 'approved', at: '2027-01-10' }
    ])

    expect(organisationYears(organisation, NOW)).toEqual([2027])
  })

  it('lists every year from approval to now while it stays approved', () => {
    const organisation = organisationOf([
      { status: 'approved', at: '2025-02-01' }
    ])

    expect(organisationYears(organisation, NOW)).toEqual([2027, 2026, 2025])
  })

  it('stops at the year of cancellation', () => {
    const organisation = organisationOf([
      { status: 'approved', at: '2025-02-01' },
      { status: 'cancelled', at: '2026-03-01' }
    ])

    expect(organisationYears(organisation, NOW)).toEqual([2026, 2025])
  })

  it('does not list the year when cancelled on the first of January', () => {
    const organisation = organisationOf([
      { status: 'approved', at: '2025-02-01' },
      { status: 'cancelled', at: '2026-01-01' }
    ])

    expect(organisationYears(organisation, NOW)).toEqual([2025])
  })

  it('skips the years between a cancellation and a reinstatement', () => {
    const organisation = organisationOf([
      { status: 'approved', at: '2024-02-01' },
      { status: 'cancelled', at: '2024-06-01' },
      { status: 'approved', at: '2026-09-01' }
    ])

    expect(organisationYears(organisation, NOW)).toEqual([2027, 2026, 2024])
  })

  it('does not list a year the approval has not reached', () => {
    const organisation = organisationOf([
      { status: 'approved', at: '2028-01-01' }
    ])

    expect(organisationYears(organisation, NOW)).toEqual([])
  })

  it('merges registrations without duplicates, newest first', () => {
    const organisation = organisationOf(
      [{ status: 'approved', at: '2026-02-01' }],
      [
        { status: 'approved', at: '2025-02-01' },
        { status: 'cancelled', at: '2026-12-01' }
      ]
    )

    expect(organisationYears(organisation, NOW)).toStrictEqual([
      2027, 2026, 2025
    ])
  })

  it('lists nothing when there are no registrations', () => {
    expect(organisationYears(partialMock({ registrations: {} }), NOW)).toEqual(
      []
    )
  })
})

describe('organisationInYear', () => {
  const accreditation = (accreditationNumber, status = 'approved') => ({
    accreditationNumber,
    status
  })

  const organisationWith = (registrations, overrides = {}) =>
    partialMock({
      name: 'ACME ltd',
      status: {
        current: 'active',
        timeline: [{ status: 'active', at: '2024-01-01' }]
      },
      ...overrides,
      registrations
    })

  const approvedFrom = (date, accreditations = {}) => ({
    status: {
      current: 'approved',
      timeline: [{ status: 'approved', at: date }]
    },
    accreditations
  })

  it('keeps a registration approved in the year with only that year’s accreditation', () => {
    const organisation = organisationWith({
      R1: approvedFrom('2025-02-01', {
        2026: accreditation('A26'),
        2027: accreditation('A27')
      })
    })

    const { registrations } = organisationInYear(organisation, 2026, NOW)

    expect(registrations.R1.accreditations).toStrictEqual({
      2026: accreditation('A26')
    })
  })

  it('serves no accreditations when the year has none', () => {
    const organisation = organisationWith({
      R1: approvedFrom('2025-02-01', { 2027: accreditation('A27') })
    })

    const { registrations } = organisationInYear(organisation, 2026, NOW)

    expect(registrations.R1.accreditations).toStrictEqual({})
  })

  it('drops a registration cancelled before the year starts', () => {
    const organisation = organisationWith({
      R1: {
        status: {
          current: 'cancelled',
          timeline: [
            { status: 'approved', at: '2024-02-01' },
            { status: 'cancelled', at: '2025-06-01' }
          ]
        },
        accreditations: {}
      }
    })

    const { registrations } = organisationInYear(organisation, 2026, NOW)

    expect(registrations).toStrictEqual({})
  })

  it('drops a registration approved after the year', () => {
    const organisation = organisationWith({
      R1: approvedFrom('2027-01-10')
    })

    const { registrations } = organisationInYear(organisation, 2026, NOW)

    expect(registrations).toStrictEqual({})
  })

  it('serves a registration cancelled part-way through the year as cancelled', () => {
    const organisation = organisationWith({
      R1: {
        status: {
          current: 'cancelled',
          timeline: [
            { status: 'approved', at: '2025-02-01' },
            { status: 'cancelled', at: '2026-03-01' }
          ]
        },
        accreditations: {}
      }
    })

    const { registrations } = organisationInYear(organisation, 2026, NOW)

    expect(registrations.R1.status.current).toBe('cancelled')
  })

  it('serves a past year’s statuses as they stood on 31 December', () => {
    const organisation = organisationWith(
      {
        R1: {
          status: {
            current: 'cancelled',
            timeline: [
              { status: 'approved', at: '2025-02-01' },
              { status: 'cancelled', at: '2026-03-01' }
            ]
          },
          accreditations: {}
        }
      },
      {
        status: {
          current: 'approved',
          timeline: [
            { status: 'created', at: '2024-01-01' },
            { status: 'approved', at: '2025-01-01' },
            { status: 'active', at: '2026-06-01' }
          ]
        }
      }
    )

    const result = organisationInYear(organisation, 2025, NOW)

    expect([
      result.status.current,
      result.registrations.R1.status.current
    ]).toStrictEqual(['approved', 'approved'])
  })

  it('serves the current year’s statuses as they stand today', () => {
    const organisation = organisationWith(
      { R1: approvedFrom('2025-02-01') },
      {
        status: {
          current: 'approved',
          timeline: [
            { status: 'approved', at: '2025-01-01' },
            { status: 'active', at: '2027-01-01' },
            { status: 'rejected', at: '2027-12-01' }
          ]
        }
      }
    )

    const { status } = organisationInYear(organisation, 2027, NOW)

    expect(status.current).toBe('active')
  })

  it('serves the last status on a year’s final day when it changed several times that day', () => {
    const organisation = organisationWith(
      { R1: approvedFrom('2025-02-01') },
      {
        status: {
          current: 'active',
          timeline: [
            { status: 'approved', at: '2025-01-01T09:00:00.000Z' },
            { status: 'rejected', at: '2025-12-31T09:00:00.000Z' },
            { status: 'active', at: '2025-12-31T15:00:00.000Z' }
          ]
        }
      }
    )

    const { status } = organisationInYear(organisation, 2025, NOW)

    expect(status.current).toBe('active')
  })

  it('keeps the current organisation status when its timeline starts later', () => {
    const organisation = organisationWith(
      { R1: approvedFrom('2025-02-01') },
      {
        status: {
          current: 'active',
          timeline: [{ status: 'active', at: '2026-06-01' }]
        }
      }
    )

    const { status } = organisationInYear(organisation, 2025, NOW)

    expect(status.current).toBe('active')
  })

  it('serves no registrations for a year that has not started', () => {
    const organisation = organisationWith({
      R1: approvedFrom('2025-02-01')
    })

    const { registrations } = organisationInYear(organisation, 2028, NOW)

    expect(registrations).toStrictEqual({})
  })

  it('leaves the other organisation fields unchanged', () => {
    const organisation = organisationWith({ R1: approvedFrom('2025-02-01') })

    const { name } = organisationInYear(organisation, 2026, NOW)

    expect(name).toBe('ACME ltd')
  })
})
