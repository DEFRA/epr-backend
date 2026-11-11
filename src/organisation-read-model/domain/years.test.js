import { toYear } from '#common/helpers/dates/year.js'
import { calendarDate } from '#common/helpers/date-formatter.js'
import { partialMock } from '#test/type-helpers.js'
import {
  organisationInYear,
  organisationYears,
  standingByYear
} from './years.js'

const registration = (timeline) => partialMock({ status: { timeline } })

const organisationOf = (...timelines) =>
  partialMock({
    registrations: Object.fromEntries(
      timelines.map((timeline, index) => [`R${index}`, registration(timeline)])
    )
  })

const approvedFrom = (date, accreditations = {}) => ({
  status: {
    current: /** @type {const} */ ('approved'),
    timeline: [{ status: 'approved', at: date }]
  },
  accreditations
})

const MARCH_15TH_2027 = new Date('2027-03-15T10:00:00.000Z')
const END_DATE = calendarDate('2027-03-15')

describe('organisationYears', () => {
  it('lists the current year for a registration approved this year', () => {
    const organisation = organisationOf([
      { status: 'approved', at: '2027-01-10T00:00:00.000Z' }
    ])

    expect(organisationYears(organisation, END_DATE)).toEqual([2027])
  })

  it('lists every year from approval to now while it stays approved', () => {
    const organisation = organisationOf([
      { status: 'approved', at: '2025-02-01T00:00:00.000Z' }
    ])

    expect(organisationYears(organisation, END_DATE)).toEqual([
      2027, 2026, 2025
    ])
  })

  it('stops at the year of cancellation', () => {
    const organisation = organisationOf([
      { status: 'approved', at: '2025-02-01T00:00:00.000Z' },
      { status: 'cancelled', at: '2026-03-01T00:00:00.000Z' }
    ])

    expect(organisationYears(organisation, END_DATE)).toEqual([2026, 2025])
  })

  it('does not list the year when cancelled on the first of January', () => {
    const organisation = organisationOf([
      { status: 'approved', at: '2025-02-01T00:00:00.000Z' },
      { status: 'cancelled', at: '2026-01-01T00:00:00.000Z' }
    ])

    expect(organisationYears(organisation, END_DATE)).toEqual([2025])
  })

  it('skips the years between a cancellation and a reinstatement', () => {
    const organisation = organisationOf([
      { status: 'approved', at: '2024-02-01T00:00:00.000Z' },
      { status: 'cancelled', at: '2024-06-01T00:00:00.000Z' },
      { status: 'approved', at: '2026-09-01T00:00:00.000Z' }
    ])

    expect(organisationYears(organisation, END_DATE)).toEqual([
      2027, 2026, 2024
    ])
  })

  it('does not list a year the approval has not reached', () => {
    const organisation = organisationOf([
      { status: 'approved', at: '2028-01-01T00:00:00.000Z' }
    ])

    expect(organisationYears(organisation, END_DATE)).toEqual([])
  })

  it('merges registrations without duplicates, newest first', () => {
    const organisation = organisationOf(
      [{ status: 'approved', at: '2026-02-01T00:00:00.000Z' }],
      [
        { status: 'approved', at: '2025-02-01T00:00:00.000Z' },
        { status: 'cancelled', at: '2026-12-01T00:00:00.000Z' }
      ]
    )

    expect(organisationYears(organisation, END_DATE)).toStrictEqual([
      2027, 2026, 2025
    ])
  })

  it('lists nothing when there are no registrations', () => {
    expect(
      organisationYears(partialMock({ registrations: {} }), END_DATE)
    ).toEqual([])
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
        timeline: [{ status: 'active', at: '2024-01-01T00:00:00.000Z' }]
      },
      ...overrides,
      registrations: Object.fromEntries(
        Object.entries(registrations).map(([number, registration]) => [
          number,
          { standingByDate: {}, ...registration }
        ])
      )
    })

  it('keeps a registration approved in the year with only that year’s accreditation', () => {
    const organisation = organisationWith({
      R1: approvedFrom('2025-02-01', {
        2026: accreditation('A26'),
        2027: accreditation('A27')
      })
    })

    const { registrations } = organisationInYear(
      organisation,
      toYear(2026),
      MARCH_15TH_2027
    )

    expect(registrations.R1.accreditations).toStrictEqual({
      2026: accreditation('A26')
    })
  })

  it('keeps only that year’s status dates', () => {
    const y2025 = { '2025-02-01': { standing: 'registeredOnly' } }
    const y2026 = { '2026-01-01': { standing: 'registeredOnly' } }
    const organisation = organisationWith({
      R1: {
        ...approvedFrom('2025-02-01'),
        standingByDate: { 2025: y2025, 2026: y2026 }
      }
    })

    const { registrations } = organisationInYear(
      organisation,
      toYear(2026),
      MARCH_15TH_2027
    )

    expect(registrations.R1.standingByDate).toStrictEqual({ 2026: y2026 })
  })

  it('serves no accreditations when the year has none', () => {
    const organisation = organisationWith({
      R1: approvedFrom('2025-02-01', { 2027: accreditation('A27') })
    })

    const { registrations } = organisationInYear(
      organisation,
      toYear(2026),
      MARCH_15TH_2027
    )

    expect(registrations.R1.accreditations).toStrictEqual({})
  })

  it('drops a registration cancelled before the year starts', () => {
    const organisation = organisationWith({
      R1: {
        status: {
          current: 'cancelled',
          timeline: [
            { status: 'approved', at: '2024-02-01T00:00:00.000Z' },
            { status: 'cancelled', at: '2025-06-01T00:00:00.000Z' }
          ]
        },
        accreditations: {}
      }
    })

    const { registrations } = organisationInYear(
      organisation,
      toYear(2026),
      MARCH_15TH_2027
    )

    expect(registrations).toStrictEqual({})
  })

  it('drops a registration approved after the year', () => {
    const organisation = organisationWith({
      R1: approvedFrom('2027-01-10')
    })

    const { registrations } = organisationInYear(
      organisation,
      toYear(2026),
      MARCH_15TH_2027
    )

    expect(registrations).toStrictEqual({})
  })

  it('serves a registration cancelled part-way through the year as cancelled', () => {
    const organisation = organisationWith({
      R1: {
        status: {
          current: 'cancelled',
          timeline: [
            { status: 'approved', at: '2025-02-01T00:00:00.000Z' },
            { status: 'cancelled', at: '2026-03-01T00:00:00.000Z' }
          ]
        },
        accreditations: {}
      }
    })

    const { registrations } = organisationInYear(
      organisation,
      toYear(2026),
      MARCH_15TH_2027
    )

    expect(registrations.R1.status.current).toBe('cancelled')
  })

  it('serves a past year’s statuses as they stood on 31 December', () => {
    const organisation = organisationWith(
      {
        R1: {
          status: {
            current: 'cancelled',
            timeline: [
              { status: 'approved', at: '2025-02-01T00:00:00.000Z' },
              { status: 'cancelled', at: '2026-03-01T00:00:00.000Z' }
            ]
          },
          accreditations: {}
        }
      },
      {
        status: {
          current: 'approved',
          timeline: [
            { status: 'created', at: '2024-01-01T00:00:00.000Z' },
            { status: 'approved', at: '2025-01-01T00:00:00.000Z' },
            { status: 'active', at: '2026-06-01T00:00:00.000Z' }
          ]
        }
      }
    )

    const result = organisationInYear(
      organisation,
      toYear(2025),
      MARCH_15TH_2027
    )

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
            { status: 'approved', at: '2025-01-01T00:00:00.000Z' },
            { status: 'active', at: '2027-01-01T00:00:00.000Z' },
            { status: 'rejected', at: '2027-12-01T00:00:00.000Z' }
          ]
        }
      }
    )

    const { status } = organisationInYear(
      organisation,
      toYear(2027),
      MARCH_15TH_2027
    )

    expect(status.current).toBe('active')
  })

  it('returns a registration with multiple status changes, as it stood on the provided statusDate', () => {
    const organisation = organisationWith({
      R1: {
        status: {
          current: 'cancelled',
          timeline: [
            { status: 'approved', at: '2027-01-10T00:00:00.000Z' },
            { status: 'cancelled', at: '2027-11-01T00:00:00.000Z' }
          ]
        },
        accreditations: {}
      }
    })

    const { registrations } = organisationInYear(
      organisation,
      toYear(2027),
      MARCH_15TH_2027 // statusDate is before the cancellation
    )

    expect(registrations.R1.status.current).toBe('approved')
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

    const { status } = organisationInYear(
      organisation,
      toYear(2025),
      MARCH_15TH_2027
    )

    expect(status.current).toBe('active')
  })

  it('keeps the current organisation status when its timeline starts later', () => {
    const organisation = organisationWith(
      { R1: approvedFrom('2025-02-01') },
      {
        status: {
          current: 'active',
          timeline: [{ status: 'active', at: '2026-06-01T00:00:00.000Z' }]
        }
      }
    )

    const { status } = organisationInYear(
      organisation,
      toYear(2025),
      MARCH_15TH_2027
    )

    expect(status.current).toBe('active')
  })

  it('serves registration for a year that is after the date on which to consider statuses', () => {
    const y2026 = { '2026-01-01': { standing: 'registeredOnly' } }
    const y2027 = { '2027-01-01': { standing: 'registeredOnly' } }
    const y2028 = { '2028-01-01': { standing: 'registeredOnly' } }
    const organisation = organisationWith({
      R1: {
        ...approvedFrom('2025-02-01'),
        standingByDate: { 2026: y2026, 2027: y2027, 2028: y2028 }
      }
    })

    const dateIn2027 = new Date('2027-01-01T10:00:00.000Z')

    const { registrations } = organisationInYear(
      organisation,
      toYear(2028),
      dateIn2027
    )

    expect(registrations.R1.status.current).toStrictEqual('approved')
    expect(registrations.R1.standingByDate).toStrictEqual({ 2028: y2028 })
  })

  it('leaves the other organisation fields unchanged', () => {
    const organisation = organisationWith({ R1: approvedFrom('2025-02-01') })

    const { name } = organisationInYear(
      organisation,
      toYear(2026),
      MARCH_15TH_2027
    )

    expect(name).toBe('ACME ltd')
  })
})

describe('standingByYear', () => {
  const TODAY = calendarDate('2026-11-03')
  const registeredOnly = { standing: 'registeredOnly' }
  const accredited = { standing: 'accredited' }

  it('covers each year from approval up to today', () => {
    expect(
      standingByYear(partialMock(approvedFrom('2025-06-02')), TODAY)
    ).toEqual({
      2025: { '2025-06-02': registeredOnly },
      2026: { '2026-01-01': registeredOnly }
    })
  })

  it('leaves out a year spent wholly cancelled', () => {
    const timeline = [
      { status: 'approved', at: '2024-06-02' },
      { status: 'cancelled', at: '2024-09-01' },
      { status: 'approved', at: '2026-03-01' }
    ]

    expect(
      Object.keys(
        standingByYear(
          partialMock({ ...registration(timeline), accreditations: {} }),
          TODAY
        )
      )
    ).toEqual(['2024', '2026'])
  })

  it('covers the year of an accreditation up to the year of the end date', () => {
    const withAccreditationFor2027 = partialMock(
      approvedFrom('2026-06-02', { 2027: approvedFrom('2026-10-01') })
    )

    expect(standingByYear(withAccreditationFor2027, TODAY)).toEqual({
      2026: { '2026-06-02': registeredOnly }
    })
    expect(
      standingByYear(withAccreditationFor2027, calendarDate('2027-12-31'))
    ).toEqual({
      2026: { '2026-06-02': registeredOnly },
      2027: { '2027-01-01': accredited }
    })
  })

  it('is empty for a registration never approved', () => {
    const timeline = [{ status: 'created', at: '2026-06-02' }]

    expect(
      standingByYear(
        partialMock({ ...registration(timeline), accreditations: {} }),
        TODAY
      )
    ).toEqual({})
  })
})
