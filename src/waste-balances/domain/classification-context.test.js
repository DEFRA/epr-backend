import { describe, it, expect } from 'vitest'

import { isAccreditedAtDates } from '#common/helpers/dates/accreditation.js'
import { isOrsApprovedAtDate } from '#overseas-sites/domain/approval.js'
import {
  neverAccredited,
  readModelAccreditedPeriod,
  readModelOverseasSitesContext,
  toAccreditedPeriod
} from './classification-context.js'

describe('toAccreditedPeriod', () => {
  it('returns null for a null accreditation', () => {
    expect(toAccreditedPeriod(null)).toBeNull()
  })

  it('has a null window when the accreditation has no dates', () => {
    const period = toAccreditedPeriod(
      /** @type {any} */ ({
        statusHistory: [{ status: 'created', updatedAt: 0 }]
      })
    )
    expect(period.window).toBeNull()
  })

  it('builds the window from validFrom and validTo', () => {
    const period = toAccreditedPeriod(
      /** @type {any} */ ({
        validFrom: '2025-01-01',
        validTo: '2025-12-31',
        statusHistory: []
      })
    )
    expect(period.window).toEqual({
      validFrom: '2025-01-01',
      validTo: '2025-12-31'
    })
  })

  it('maps statusHistory to a timeline with ISO string timestamps', () => {
    const period = toAccreditedPeriod(
      /** @type {any} */ ({
        validFrom: '2025-01-01',
        validTo: '2025-12-31',
        statusHistory: [
          { status: 'created', updatedAt: Date.UTC(2024, 11, 1, 10) },
          { status: 'approved', updatedAt: '2025-01-01T00:00:00.000Z' }
        ]
      })
    )
    expect(period.timeline).toEqual([
      { status: 'created', at: '2024-12-01T10:00:00.000Z' },
      { status: 'approved', at: '2025-01-01T00:00:00.000Z' }
    ])
  })
})

const accreditationWith = (timeline, extra = {}) =>
  /** @type {any} */ ({
    status: { current: timeline.at(-1)?.status, timeline },
    ...extra
  })

describe('readModelAccreditedPeriod', () => {
  const created = { status: 'created', at: '2024-11-01T10:00:00.000Z' }
  const approved = { status: 'approved', at: '2025-01-01T00:00:00.000Z' }

  it('starts the window at approval and ends it on 31 December of the year', () => {
    const period = readModelAccreditedPeriod(
      accreditationWith([created, approved]),
      '2025'
    )
    expect(period.window).toEqual({
      validFrom: '2025-01-01',
      validTo: '2025-12-31'
    })
  })

  it('passes the timeline through', () => {
    const timeline = [created, approved]
    expect(
      readModelAccreditedPeriod(accreditationWith(timeline), '2025').timeline
    ).toBe(timeline)
  })

  it.each(['suspended', 'cancelled'])(
    'keeps the window of an approved accreditation later %s',
    (status) => {
      const timeline = [
        created,
        approved,
        { status, at: '2025-06-01T00:00:00.000Z' }
      ]
      const period = readModelAccreditedPeriod(
        accreditationWith(timeline),
        '2025'
      )
      expect(period.window).toEqual({
        validFrom: '2025-01-01',
        validTo: '2025-12-31'
      })
      expect(period.timeline).toBe(timeline)
    }
  )

  it('has a null window when there is no approval entry', () => {
    expect(
      readModelAccreditedPeriod(accreditationWith([created]), '2025').window
    ).toBeNull()
  })

  it('uses the first approval after the last created entry', () => {
    const period = readModelAccreditedPeriod(
      accreditationWith([
        { status: 'approved', at: '2023-01-01T00:00:00.000Z' },
        { status: 'created', at: '2024-11-01T00:00:00.000Z' },
        approved,
        { status: 'approved', at: '2025-03-01T00:00:00.000Z' }
      ]),
      '2025'
    )
    expect(period.window?.validFrom).toBe('2025-01-01')
  })
})

describe('neverAccredited', () => {
  it('has no window and an empty timeline', () => {
    expect(neverAccredited()).toEqual({ window: null, timeline: [] })
  })

  it('is accredited at no date, unlike a null accreditation', () => {
    expect(isAccreditedAtDates(['2025-06-01'], neverAccredited())).toBe(false)
    expect(isAccreditedAtDates(['2025-06-01'], null)).toBe(true)
  })
})

describe('readModelOverseasSitesContext', () => {
  const registration = /** @type {any} */ ({
    wasteProcessingType: 'exporter',
    overseasSites: {
      '001': { name: 'Site A', address: { country: 'India', line1: 'x' } },
      '002': { name: 'Site B', address: { country: 'Turkey', line1: 'y' } }
    }
  })

  it('builds approved, pending and skips sites missing from the registration', () => {
    const accreditation = /** @type {any} */ ({
      overseasSites: {
        '001': { status: 'approved', approvedOn: '2025-02-03' },
        '002': { status: 'pending' },
        '003': { status: 'approved', approvedOn: '2025-02-03' }
      }
    })
    expect(readModelOverseasSitesContext(registration, accreditation)).toEqual({
      '001': {
        approvedFrom: new Date('2025-02-03T00:00:00.000Z'),
        name: 'Site A',
        country: 'India'
      },
      '002': { approvedFrom: null, name: 'Site B', country: 'Turkey' }
    })
  })

  it('returns an empty context for a reprocessor', () => {
    expect(
      readModelOverseasSitesContext(
        /** @type {any} */ ({ wasteProcessingType: 'reprocessor' }),
        /** @type {any} */ ({})
      )
    ).toEqual({})
  })

  it('counts an export dated on the approval day as approved (VAL014 not raised)', () => {
    const accreditation = /** @type {any} */ ({
      overseasSites: {
        '001': { status: 'approved', approvedOn: '2025-02-03' }
      }
    })
    const { approvedFrom } = /** @type {any} */ (
      readModelOverseasSitesContext(registration, accreditation)
    )['001']
    expect(isOrsApprovedAtDate(approvedFrom, '2025-02-03')).toBe(true)
    expect(isOrsApprovedAtDate(approvedFrom, '2025-02-02')).toBe(false)
  })
})
