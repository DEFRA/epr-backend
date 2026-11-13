import { StatusCodes } from 'http-status-codes'

import {
  accreditation,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import {
  buildLinkedDefraOrg,
  createOrganisationBuilders
} from '#repositories/organisations/contract/test-data.js'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'
import { config } from '#root/config.js'
import { asOperator, asUnscopedAdminUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { testRegulatorCanRead } from '#vite/helpers/test-invalid-roles-scenarios.js'
import {
  EXPORTER_NUMBER,
  REPROCESSOR_NUMBER,
  body,
  createAccreditedOrganisationBuilder,
  exporterResponse,
  reprocessorResponse,
  useViewServer
} from './organisation-view-test-helpers.js'

const organisationBuilders = createOrganisationBuilders()
const { buildOrganisation } = organisationBuilders
const buildAccreditedOrganisation =
  createAccreditedOrganisationBuilder(organisationBuilders)

const reinstatedThenCancelledOnNewYearsDay = () => {
  const statusHistory = [
    { status: 'created', updatedAt: '2025-01-01T09:00:00.000Z' },
    { status: 'approved', updatedAt: '2025-02-01T09:00:00.000Z' },
    { status: 'cancelled', updatedAt: '2026-01-01T09:00:00.000Z' },
    { status: 'approved', updatedAt: '2026-01-01T12:00:00.000Z' },
    { status: 'cancelled', updatedAt: '2026-01-01T15:00:00.000Z' }
  ]
  const accredited = accreditation({
    validFrom: '2025-07-01',
    validTo: '2025-12-31',
    statusHistory
  })
  return buildOrganisation({
    registrations: [
      reprocessor({
        accreditationId: accredited.id,
        validFrom: '2025-02-01',
        statusHistory
      })
    ],
    accreditations: [accredited]
  })
}

const approvedThenCancelled = () =>
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

const approvedThenCancelledTimeline = [
  {
    status: 'created',
    at: '2025-01-01T09:00:00.000Z',
    updatedAt: '2025-01-01T09:00:00.000Z'
  },
  {
    status: 'approved',
    at: '2025-03-01T00:00:00.000Z',
    updatedAt: '2025-04-01T09:00:00.000Z'
  },
  {
    status: 'cancelled',
    at: '2026-03-01T09:00:00.000Z',
    updatedAt: '2026-03-01T09:00:00.000Z'
  }
]

describe('GET /organisations/{organisationNumber}', () => {
  setupAuthContext()

  const { server, serve, serveStored, get } = useViewServer()

  afterEach(() => {
    vi.useRealTimers()
  })

  it('serves the organisation without the fields that are not served', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-01') })
    const linked = buildLinkedDefraOrg('defra-org-1', 'Defra Org')
    const organisation = buildAccreditedOrganisation({
      linkedDefraOrganisation: linked
    })
    await serve(organisation)

    const response = await get(
      `/organisations/${organisation.organisationNumber}`
    )

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(body(response)).toEqual({
      organisationNumber: organisation.organisationNumber,
      name: 'ACME ltd',
      displayName: 'ACME ltd',
      status: { current: 'created' },
      submittedToRegulator: { code: 'ea' },
      linkedDefraOrganisation: {
        defraOrganisation: { id: 'defra-org-1', name: 'Defra Org' },
        linkedAt: linked.linkedAt,
        linkedBy: { email: 'linker@example.com' }
      },
      registrations: {
        [REPROCESSOR_NUMBER]: reprocessorResponse,
        [EXPORTER_NUMBER]: exporterResponse
      }
    })
  })

  it('serves the whole status timelines of an accreditation and its registration', async () => {
    const suspended = accreditation({
      statusHistory: [
        { status: 'created', updatedAt: '2026-01-01T09:00:00.000Z' },
        { status: 'approved', updatedAt: '2026-02-01T09:00:00.000Z' },
        { status: 'suspended', updatedAt: '2026-05-01T09:00:00.000Z' }
      ]
    })
    const organisation = buildOrganisation({
      registrations: [reprocessor({ accreditationId: suspended.id })],
      accreditations: [suspended]
    })
    await serve(organisation)

    const response = await get(
      `/organisations/${organisation.organisationNumber}`
    )

    const registration = body(response).registrations[REPROCESSOR_NUMBER]
    expect(registration.accreditations[2026].status.timeline).toEqual([
      {
        status: 'created',
        at: '2026-01-01T09:00:00.000Z',
        updatedAt: '2026-01-01T09:00:00.000Z'
      },
      {
        status: 'suspended',
        at: '2026-05-01T09:00:00.000Z',
        updatedAt: '2026-05-01T09:00:00.000Z'
      }
    ])
    expect(registration.status.timeline).toEqual([
      {
        status: 'created',
        at: '2026-01-01T09:00:00.000Z',
        updatedAt: '2026-01-01T09:00:00.000Z'
      },
      {
        status: 'approved',
        at: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-01T09:00:00.000Z'
      }
    ])
  })

  it('serves a registration approved and later cancelled with its whole status timeline', async () => {
    const organisation = approvedThenCancelled()
    await serve(organisation)

    const response = await get(
      `/organisations/${organisation.organisationNumber}`
    )

    const registration = body(response).registrations[REPROCESSOR_NUMBER]
    expect(registration.status.timeline).toEqual(approvedThenCancelledTimeline)
  })

  it('serves every one of several status changes on one day with its time', async () => {
    const organisation = reinstatedThenCancelledOnNewYearsDay()
    await serve(organisation)

    const response = await get(
      `/organisations/${organisation.organisationNumber}`
    )

    const registration = body(response).registrations[REPROCESSOR_NUMBER]
    expect(registration.accreditations[2025].status.timeline).toEqual([
      {
        status: 'created',
        at: '2025-01-01T09:00:00.000Z',
        updatedAt: '2025-01-01T09:00:00.000Z'
      },
      {
        status: 'approved',
        at: '2025-07-01T00:00:00.000Z',
        updatedAt: '2025-02-01T09:00:00.000Z'
      },
      {
        status: 'cancelled',
        at: '2026-01-01T09:00:00.000Z',
        updatedAt: '2026-01-01T09:00:00.000Z'
      },
      {
        status: 'approved',
        at: '2026-01-01T12:00:00.000Z',
        updatedAt: '2026-01-01T12:00:00.000Z'
      },
      {
        status: 'cancelled',
        at: '2026-01-01T15:00:00.000Z',
        updatedAt: '2026-01-01T15:00:00.000Z'
      }
    ])
  })

  it('serves each status change at its own time even when the history is stored out of order', async () => {
    const reinstated = accreditation({
      statusHistory: [
        { status: 'created', updatedAt: '2026-01-01T09:00:00.000Z' },
        { status: 'approved', updatedAt: '2026-02-01T09:00:00.000Z' },
        { status: 'cancelled', updatedAt: '2026-03-01T15:00:00.000Z' },
        { status: 'suspended', updatedAt: '2026-03-01T12:00:00.000Z' }
      ]
    })
    const organisation = buildOrganisation({
      registrations: [reprocessor({ accreditationId: reinstated.id })],
      accreditations: [reinstated]
    })
    await serve(organisation)

    const response = await get(
      `/organisations/${organisation.organisationNumber}`
    )

    const registration = body(response).registrations[REPROCESSOR_NUMBER]
    expect(registration.accreditations[2026].status.timeline).toEqual([
      {
        status: 'created',
        at: '2026-01-01T09:00:00.000Z',
        updatedAt: '2026-01-01T09:00:00.000Z'
      },
      {
        status: 'suspended',
        at: '2026-03-01T12:00:00.000Z',
        updatedAt: '2026-03-01T12:00:00.000Z'
      },
      {
        status: 'cancelled',
        at: '2026-03-01T15:00:00.000Z',
        updatedAt: '2026-03-01T15:00:00.000Z'
      }
    ])
  })

  it('serves an organisation as the repository stores it', async () => {
    const linked = buildLinkedDefraOrg(crypto.randomUUID(), 'Defra Org')
    const organisation = buildOrganisation({
      linkedDefraOrganisation: linked
    })
    await serveStored(organisation)

    const response = await get(
      `/organisations/${organisation.organisationNumber}`
    )

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(body(response).linkedDefraOrganisation.linkedAt).toBe(
      linked.linkedAt
    )
  })

  describe('display name', () => {
    /** @param {{ name: string, tradingName?: string }} companyDetails */
    const displayNameFor = async (companyDetails) => {
      const base = buildOrganisation()
      const organisation = {
        ...base,
        companyDetails: { ...base.companyDetails, ...companyDetails }
      }
      await serve(organisation)
      return body(
        await get(`/organisations/${organisation.organisationNumber}`)
      )
    }

    it('is the trading name when the organisation has one', async () => {
      expect(
        await displayNameFor({
          name: 'Kirkby Plastics Ltd',
          tradingName: 'Kirkby Recycling'
        })
      ).toMatchObject({
        name: 'Kirkby Plastics Ltd',
        displayName: 'Kirkby Recycling'
      })
    })

    it('is the company name when there is no trading name', async () => {
      expect(
        await displayNameFor({
          name: 'Kirkby Plastics Ltd',
          tradingName: undefined
        })
      ).toMatchObject({ displayName: 'Kirkby Plastics Ltd' })
    })

    it('is the company name when the trading name is blank', async () => {
      expect(
        await displayNameFor({ name: 'Kirkby Plastics Ltd', tradingName: '  ' })
      ).toMatchObject({ displayName: 'Kirkby Plastics Ltd' })
    })

    it('serves no trading name', async () => {
      expect(
        await displayNameFor({
          name: 'Kirkby Plastics Ltd',
          tradingName: 'Kirkby Recycling'
        })
      ).not.toHaveProperty('tradingName')
    })
  })

  it('returns 404 for an unknown organisation number', async () => {
    await serve(
      buildOrganisation({ organisationNumber: toOrganisationNumber('500001') })
    )

    const response = await get('/organisations/500002')

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('rejects an organisation number that is not a number', async () => {
    await serve(buildOrganisation())

    const response = await get('/organisations/not-a-number')

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('rejects an organisation number with a leading zero', async () => {
    const organisation = buildOrganisation({
      organisationNumber: toOrganisationNumber('500001')
    })
    await serve(organisation)

    const response = await get('/organisations/0500001')

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  describe('authorisation', () => {
    const organisation = buildAccreditedOrganisation()
    const request = async () => {
      await serve(organisation)
      return {
        method: 'GET',
        url: `/organisations/${organisation.organisationNumber}`
      }
    }

    it('shows an operator their own organisation', async () => {
      const { url } = await request()

      const response = await get(url, asOperator())

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('refuses a caller who holds no organisation read', async () => {
      const { url } = await request()

      const response = await get(url, asUnscopedAdminUser())

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    testRegulatorCanRead({ server, makeRequest: request })
  })

  describe('relevant year', () => {
    it.for([
      {
        description: 'open during the year',
        validFrom: '2026-01-01',
        now: '2026-10-01T00:00:00.000Z',
        open: true
      },
      {
        description: 'open on the last instant of 31 January after it',
        validFrom: '2026-01-01',
        now: '2027-01-31T23:59:59.999Z',
        open: true
      },
      {
        description: 'closed from 1 February after it',
        validFrom: '2026-01-01',
        now: '2027-02-01T00:00:00.000Z',
        open: false
      },
      {
        description: 'open to the same deadline when granted mid-year',
        validFrom: '2026-05-01',
        now: '2027-01-31T23:59:59.999Z',
        open: true
      },
      {
        description: 'closed at the same deadline when granted mid-year',
        validFrom: '2026-05-01',
        now: '2027-02-01T00:00:00.000Z',
        open: false
      }
    ])(
      'should serve the accreditation as $description',
      async ({ validFrom, now, open }) => {
        vi.useFakeTimers({ toFake: ['Date'], now: new Date(now) })
        const accredited = accreditation({ validFrom })
        const organisation = buildOrganisation({
          registrations: [reprocessor({ accreditationId: accredited.id })],
          accreditations: [accredited]
        })
        await serve(organisation)

        const response = await get(
          `/organisations/${organisation.organisationNumber}`
        )

        const registration = body(response).registrations[REPROCESSOR_NUMBER]
        expect(registration.accreditations[2026].prns).toStrictEqual({ open })
      }
    )
  })

  describe('standingByDate', () => {
    const approvedSince = (updatedAt) => [
      { status: 'created', updatedAt: '2025-01-01T09:00:00.000Z' },
      { status: 'approved', updatedAt }
    ]

    const standingOf = async (organisation, query = '') => {
      await serve(organisation)
      const response = await get(
        `/organisations/${organisation.organisationNumber}${query}`
      )
      return body(response).registrations[REPROCESSOR_NUMBER].standingByDate
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-03-15') })
    })

    afterEach(() => {
      config.reset('openNextYear')
    })

    it('serves every year the registration was approved in', async () => {
      const organisation = buildOrganisation({
        registrations: [
          reprocessor({
            validFrom: '2026-02-01',
            statusHistory: approvedSince('2026-02-01T09:00:00.000Z')
          })
        ]
      })

      expect(await standingOf(organisation)).toEqual({
        2026: { '2026-02-01': { standing: 'registeredOnly' } },
        2027: { '2027-01-01': { standing: 'registeredOnly' } }
      })
    })

    it('serves next year while it is open', async () => {
      config.set('openNextYear', true)
      const organisation = buildOrganisation({
        registrations: [
          reprocessor({
            validFrom: '2026-02-01',
            statusHistory: approvedSince('2026-02-01T09:00:00.000Z')
          })
        ]
      })

      expect(await standingOf(organisation, '?year=2028')).toEqual({
        2028: { '2028-01-01': { standing: 'registeredOnly' } }
      })
    })

    it('serves only the year asked for', async () => {
      const organisation = buildOrganisation({
        registrations: [
          reprocessor({
            validFrom: '2026-02-01',
            statusHistory: approvedSince('2026-02-01T09:00:00.000Z')
          })
        ]
      })

      expect(await standingOf(organisation, '?year=2026')).toEqual({
        2026: { '2026-02-01': { standing: 'registeredOnly' } }
      })
    })

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

    it('serves next year accredited from an accreditation approved early, while that year is open', async () => {
      config.set('openNextYear', true)

      expect(await standingOf(accreditedEarlyForNextYear())).toEqual({
        2027: { '2027-01-10': { standing: 'registeredOnly' } },
        2028: { '2028-01-01': { standing: 'accredited' } }
      })
    })

    it('leaves out next year while it is closed, even with an accreditation approved early', async () => {
      expect(await standingOf(accreditedEarlyForNextYear())).toEqual({
        2027: { '2027-01-10': { standing: 'registeredOnly' } }
      })
    })

    const servedYearsOf = async (organisation) => {
      await serve(organisation)
      const response = await get(
        `/organisations/${organisation.organisationNumber}`
      )
      const registration = body(response).registrations[REPROCESSOR_NUMBER]
      return {
        accreditations: Object.keys(registration.accreditations),
        standingByDate: Object.keys(registration.standingByDate)
      }
    }

    it("serves next year's accreditation alongside its status dates while that year is open", async () => {
      config.set('openNextYear', true)

      expect(await servedYearsOf(accreditedEarlyForNextYear())).toEqual({
        accreditations: ['2028'],
        standingByDate: ['2027', '2028']
      })
    })

    it("leaves out next year's accreditation along with its status dates while that year is closed", async () => {
      expect(await servedYearsOf(accreditedEarlyForNextYear())).toEqual({
        accreditations: [],
        standingByDate: ['2027']
      })
    })

    it('serves a registration cancelled part way through a year', async () => {
      expect(await standingOf(approvedThenCancelled())).toEqual({
        2025: { '2025-03-01': { standing: 'registeredOnly' } },
        2026: {
          '2026-01-01': { standing: 'registeredOnly' },
          '2026-03-01': { standing: 'cancelled' }
        }
      })
    })
  })

  describe('with a year', () => {
    const urlFor = (organisation, year) =>
      `/organisations/${organisation.organisationNumber}?year=${year}`

    /** @param {typeof reprocessorResponse | typeof exporterResponse} registration */
    const closed = (registration) => ({
      ...registration,
      accreditations: {
        2026: { ...registration.accreditations[2026], prns: { open: false } }
      }
    })

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-03-15') })
    })

    it('serves the registrations approved in the year with that year’s accreditations', async () => {
      const organisation = buildAccreditedOrganisation()
      await serve(organisation)

      const response = await get(urlFor(organisation, 2026))

      expect(body(response).registrations).toEqual({
        [REPROCESSOR_NUMBER]: closed(reprocessorResponse),
        [EXPORTER_NUMBER]: closed(exporterResponse)
      })
    })

    it('serves the status and accreditation as they stood in the year', async () => {
      const accredited = accreditation({
        validFrom: '2025-07-01',
        validTo: '2025-12-31',
        statusHistory: [
          { status: 'created', updatedAt: '2025-01-01T09:00:00.000Z' },
          { status: 'approved', updatedAt: '2025-02-01T09:00:00.000Z' }
        ]
      })
      const organisation = buildOrganisation({
        registrations: [
          reprocessor({
            accreditationId: accredited.id,
            validFrom: '2025-02-01',
            statusHistory: [
              { status: 'created', updatedAt: '2025-01-01T09:00:00.000Z' },
              { status: 'approved', updatedAt: '2025-02-01T09:00:00.000Z' },
              { status: 'cancelled', updatedAt: '2026-03-01T09:00:00.000Z' }
            ]
          })
        ],
        accreditations: [accredited]
      })
      await serve(organisation)

      const summaries = []
      for (const year of [2025, 2026, 2027]) {
        const response = await get(urlFor(organisation, year))
        const registration = body(response).registrations[REPROCESSOR_NUMBER]
        summaries.push(
          registration && [
            registration.status.current,
            Object.keys(registration.accreditations)
          ]
        )
      }

      expect(summaries).toEqual([
        ['approved', ['2025']],
        ['cancelled', []],
        undefined
      ])
    })

    it('serves a registration recorded after its validFrom as approved in that year', async () => {
      const recordedLate = [
        { status: 'created', updatedAt: '2026-10-14T14:30:47.171Z' },
        { status: 'approved', updatedAt: '2026-10-14T14:30:47.204Z' }
      ]
      const accredited = accreditation({
        validFrom: '2026-01-01',
        statusHistory: recordedLate
      })
      const organisation = buildOrganisation({
        registrations: [
          reprocessor({
            accreditationId: accredited.id,
            validFrom: '2026-01-01',
            statusHistory: recordedLate
          })
        ],
        accreditations: [accredited]
      })
      await serve(organisation)

      const response = await get(urlFor(organisation, 2026))

      const registration = body(response).registrations[REPROCESSOR_NUMBER]
      expect(registration.status.current).toBe('approved')
      expect(registration.accreditations[2026].status.timeline).toEqual([
        {
          status: 'approved',
          at: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-10-14T14:30:47.204Z'
        }
      ])
    })

    it('serves a registration’s whole status timeline in a year it was cancelled', async () => {
      const organisation = approvedThenCancelled()
      await serve(organisation)

      const response = await get(urlFor(organisation, 2026))

      const registration = body(response).registrations[REPROCESSOR_NUMBER]
      expect(registration.status.current).toBe('cancelled')
      expect(registration.status.timeline).toEqual(
        approvedThenCancelledTimeline
      )
    })

    it('classifies a year by the last of several status changes on one day', async () => {
      const organisation = reinstatedThenCancelledOnNewYearsDay()
      await serve(organisation)

      const in2025 = body(await get(urlFor(organisation, 2025)))
      const in2026 = body(await get(urlFor(organisation, 2026)))

      expect(in2025.registrations[REPROCESSOR_NUMBER].status.current).toBe(
        'approved'
      )
      expect(in2026.registrations).toEqual({})
    })

    describe('for next year', () => {
      const withNextYearAccreditation = () => {
        const accredited = accreditation({
          validFrom: '2028-01-01',
          validTo: '2028-12-31'
        })
        return buildOrganisation({
          registrations: [reprocessor({ accreditationId: accredited.id })],
          accreditations: [accredited]
        })
      }

      afterEach(() => {
        config.reset('openNextYear')
      })

      it('serves its registrations and accreditations while it is open', async () => {
        config.set('openNextYear', true)
        const organisation = withNextYearAccreditation()
        await serve(organisation)

        const response = await get(urlFor(organisation, 2028))

        const registration = body(response).registrations[REPROCESSOR_NUMBER]
        expect(Object.keys(registration.accreditations)).toEqual(['2028'])
        expect(registration.status.current).toBe('approved')
      })

      it('returns 404 while it is closed', async () => {
        const organisation = withNextYearAccreditation()
        await serve(organisation)

        const response = await get(urlFor(organisation, 2028))

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })
    })

    it('rejects a year outside the supported range', async () => {
      const organisation = buildAccreditedOrganisation()
      await serve(organisation)

      const response = await get(urlFor(organisation, 1999))

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })
})
