import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'
import { config } from '#root/config.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { partialMock } from '#test/type-helpers.js'
import {
  REPROCESSOR_NUMBER,
  accreditation,
  reprocessor
} from './contract/organisation-read-test-helpers.js'
import { toReadModelOrganisations } from './to-read-model.js'

/** @import { Year } from '#common/helpers/dates/year.js' */

const { buildOrganisation } = createOrganisationBuilders()

/**
 * The registration the read model serves for the organisation's reprocessor,
 * after storing the organisation so its current statuses are derived as they
 * are in production.
 *
 * @param {object} organisation
 * @param {Year} [year]
 */
const reprocessorOf = async (organisation, year) => {
  const stored = await createInMemoryOrganisationsRepository([
    partialMock(organisation)
  ])().findAll()
  const [served] = await toReadModelOrganisations(
    stored,
    [],
    {
      overseasSitesRepository: { findByIds: async () => [] },
      logger: { warn: () => {} }
    },
    year
  )
  return served.registrations[REPROCESSOR_NUMBER]
}

/** @param {string} updatedAt */
const approvedSince = (updatedAt) => [
  { status: 'created', updatedAt: '2025-01-01T09:00:00.000Z' },
  { status: 'approved', updatedAt }
]

const accreditedEarlyForNextYear = () => {
  const accredited = accreditation({
    validFrom: '2028-01-01',
    validTo: '2028-12-31',
    statusHistory: approvedSince('2027-02-01T09:00:00.000Z')
  })
  return buildOrganisation({
    registrations: [
      reprocessor({
        accreditationId: accredited.id,
        validFrom: '2027-01-10',
        statusHistory: approvedSince('2027-01-10T09:00:00.000Z')
      })
    ],
    accreditations: [accredited]
  })
}

describe('toReadModelOrganisations', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-03-15') })
  })

  afterEach(() => {
    vi.useRealTimers()
    config.reset('openNextYear')
  })

  it('sorts changes by when they were recorded, even when the history is stored out of order', async () => {
    const reinstated = accreditation({
      validFrom: '2026-01-01',
      statusHistory: [
        { status: 'created', updatedAt: '2025-12-01T09:00:00.000Z' },
        { status: 'approved', updatedAt: '2025-12-15T09:00:00.000Z' },
        { status: 'cancelled', updatedAt: '2026-03-01T15:00:00.000Z' },
        { status: 'suspended', updatedAt: '2026-03-01T12:00:00.000Z' }
      ]
    })
    const registration = await reprocessorOf(
      buildOrganisation({
        registrations: [reprocessor({ accreditationId: reinstated.id })],
        accreditations: [reinstated]
      })
    )

    expect(registration.accreditations[2026].status.timeline).toEqual([
      { status: 'approved', at: '2026-01-01T00:00:00.000Z' },
      { status: 'suspended', at: '2026-03-01T12:00:00.000Z' },
      { status: 'cancelled', at: '2026-03-01T15:00:00.000Z' }
    ])
  })

  describe('standingByDate', () => {
    it('gives every year the registration was approved in, up to the current year', async () => {
      const registration = await reprocessorOf(
        buildOrganisation({
          registrations: [
            reprocessor({
              validFrom: '2026-02-01',
              statusHistory: approvedSince('2026-02-01T09:00:00.000Z')
            })
          ]
        })
      )

      expect(registration.standingByDate).toEqual({
        2026: { '2026-02-01': { standing: 'registeredOnly' } },
        2027: { '2027-01-01': { standing: 'registeredOnly' } }
      })
    })

    it('gives a registration cancelled part way through a year', async () => {
      const registration = await reprocessorOf(
        buildOrganisation({
          registrations: [
            reprocessor({
              validFrom: '2025-03-01',
              statusHistory: [
                { status: 'created', updatedAt: '2025-01-01T09:00:00.000Z' },
                { status: 'approved', updatedAt: '2025-04-01T09:00:00.000Z' },
                { status: 'cancelled', updatedAt: '2026-03-01T09:00:00.000Z' }
              ]
            })
          ]
        })
      )

      expect(registration.standingByDate).toEqual({
        2025: { '2025-03-01': { standing: 'registeredOnly' } },
        2026: {
          '2026-01-01': { standing: 'registeredOnly' },
          '2026-03-01': { standing: 'cancelled' }
        }
      })
    })

    it("gives next year's accreditation alongside its status dates while that year is open", async () => {
      config.set('openNextYear', true)

      const registration = await reprocessorOf(accreditedEarlyForNextYear())

      expect(Object.keys(registration.accreditations)).toEqual(['2028'])
      expect(registration.standingByDate).toEqual({
        2027: { '2027-01-10': { standing: 'registeredOnly' } },
        2028: { '2028-01-01': { standing: 'accredited' } }
      })
    })

    it("leaves out next year's accreditation along with its status dates while that year is closed", async () => {
      const registration = await reprocessorOf(accreditedEarlyForNextYear())

      expect(Object.keys(registration.accreditations)).toEqual([])
      expect(Object.keys(registration.standingByDate)).toEqual(['2027'])
    })

    it('gives only the year asked for, even when next year is open', async () => {
      config.set('openNextYear', true)

      const registration = await reprocessorOf(
        accreditedEarlyForNextYear(),
        toYear(2027)
      )

      expect(registration.standingByDate).toEqual({
        2027: { '2027-01-10': { standing: 'registeredOnly' } }
      })
    })
  })

  it('gives a registration recorded after its validFrom as approved in that year', async () => {
    const recordedLate = [
      { status: 'created', updatedAt: '2026-10-14T14:30:47.171Z' },
      { status: 'approved', updatedAt: '2026-10-14T14:30:47.204Z' }
    ]
    const accredited = accreditation({
      validFrom: '2026-01-01',
      statusHistory: recordedLate
    })
    const registration = await reprocessorOf(
      buildOrganisation({
        registrations: [
          reprocessor({
            accreditationId: accredited.id,
            validFrom: '2026-01-01',
            statusHistory: recordedLate
          })
        ],
        accreditations: [accredited]
      }),
      toYear(2026)
    )

    expect(registration.status.current).toBe('approved')
    expect(registration.accreditations[2026].status).toMatchObject({
      lastUpdatedAt: '2026-10-14T14:30:47.204Z',
      timeline: [{ status: 'approved', at: '2026-01-01T00:00:00.000Z' }]
    })
  })
})
