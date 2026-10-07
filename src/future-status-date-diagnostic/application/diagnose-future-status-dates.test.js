import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { partialMock } from '#test/type-helpers.js'

import { diagnoseFutureStatusDates } from './diagnose-future-status-dates.js'

/** @import { StatusHistoryEntryOf } from '#domain/organisations/accreditation.js' */

const NOW = new Date('2026-10-07T12:00:00.000Z')
const FUTURE = '2026-10-08T00:00:00.000Z'

/**
 * @param {string} updatedAt
 * @returns {StatusHistoryEntryOf<'created' | 'approved'>[]}
 */
const historyEndingOn = (updatedAt) => [
  { status: 'created', updatedAt: new Date('2026-01-01T00:00:00.000Z') },
  { status: 'approved', updatedAt: new Date(updatedAt) }
]

/** @param {ReturnType<typeof buildOrganisation>[]} organisations */
const diagnose = (organisations) =>
  diagnoseFutureStatusDates(
    organisations.map((organisation) => partialMock(organisation)),
    NOW
  )

describe('diagnoseFutureStatusDates', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('describes a future-dated registration entry', () => {
    const registration = buildRegistration({
      statusHistory: historyEndingOn(FUTURE)
    })
    const organisation = buildOrganisation({ registrations: [registration] })

    const { rows } = diagnose([organisation])

    expect(rows).toStrictEqual([
      {
        organisationId: organisation.id,
        orgId: organisation.orgId,
        testOrganisation: false,
        itemType: 'registration',
        itemId: registration.id,
        status: 'approved',
        updatedAt: FUTURE
      }
    ])
  })

  it('leaves out entries dated on or before now', () => {
    const organisation = buildOrganisation({
      registrations: [
        buildRegistration({
          statusHistory: historyEndingOn(NOW.toISOString())
        })
      ]
    })

    const { rows } = diagnose([organisation])

    expect(rows).toStrictEqual([])
  })

  it('checks organisation and accreditation histories too', () => {
    const accreditation = buildAccreditation({
      statusHistory: historyEndingOn(FUTURE)
    })
    const organisation = buildOrganisation({
      statusHistory: historyEndingOn(FUTURE),
      registrations: [],
      accreditations: [accreditation]
    })

    const { rows } = diagnose([organisation])

    expect(rows).toStrictEqual([
      expect.objectContaining({
        itemType: 'organisation',
        itemId: organisation.id
      }),
      expect.objectContaining({
        itemType: 'accreditation',
        itemId: accreditation.id
      })
    ])
  })

  it('counts what it scanned and what is future-dated', () => {
    const { summary } = diagnose([
      buildOrganisation({
        registrations: [
          buildRegistration({ statusHistory: historyEndingOn(FUTURE) })
        ],
        accreditations: []
      }),
      buildOrganisation({ registrations: [], accreditations: [] })
    ])

    expect(summary).toStrictEqual({
      scannedOrganisations: 2,
      scannedEntries: 4,
      futureDatedEntries: 1
    })
  })
})
