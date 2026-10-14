import { StatusCodes } from 'http-status-codes'

import {
  accreditation,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import {
  buildLinkedDefraOrg,
  buildOrganisation
} from '#repositories/organisations/contract/test-data.js'
import { asOperator, asUnscopedAdminUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { testRegulatorCanRead } from '#vite/helpers/test-invalid-roles-scenarios.js'
import {
  EXPORTER_NUMBER,
  REPROCESSOR_NUMBER,
  body,
  buildAccreditedOrganisation,
  exporterResponse,
  reprocessorResponse,
  useViewServer
} from './organisation-view-test-helpers.js'

describe('GET /organisations/{organisationNumber}', () => {
  setupAuthContext()

  const { server, serve, serveStored, get } = useViewServer()

  it('serves the organisation without the fields that are not served', async () => {
    const linked = buildLinkedDefraOrg('defra-org-1', 'Defra Org')
    const organisation = buildAccreditedOrganisation({
      linkedDefraOrganisation: linked
    })
    await serve(organisation)

    const response = await get(`/organisations/${organisation.orgId}`)

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(body(response)).toEqual({
      organisationNumber: organisation.orgId,
      name: 'ACME ltd',
      tradingName: 'ACME ltd',
      status: 'created',
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

  it('serves an accreditation’s whole status timeline but no registration timeline', async () => {
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

    const response = await get(`/organisations/${organisation.orgId}`)

    const registration = body(response).registrations[REPROCESSOR_NUMBER]
    expect(registration.accreditations[2026].statusTimeline).toEqual({
      '2026-01-01': { status: 'created' },
      '2026-05-01': { status: 'suspended' },
      '2026-07-01': { status: 'approved' }
    })
    expect(registration).not.toHaveProperty('statusTimeline')
  })

  it('serves the last of several status changes on one day as that day’s status', async () => {
    const reinstated = accreditation({
      statusHistory: [
        { status: 'created', updatedAt: '2026-01-01T09:00:00.000Z' },
        { status: 'approved', updatedAt: '2026-02-01T09:00:00.000Z' },
        { status: 'suspended', updatedAt: '2026-03-01T09:00:00.000Z' },
        { status: 'cancelled', updatedAt: '2026-03-01T12:00:00.000Z' },
        { status: 'approved', updatedAt: '2026-03-01T15:00:00.000Z' }
      ]
    })
    const organisation = buildOrganisation({
      registrations: [reprocessor({ accreditationId: reinstated.id })],
      accreditations: [reinstated]
    })
    await serve(organisation)

    const response = await get(`/organisations/${organisation.orgId}`)

    const registration = body(response).registrations[REPROCESSOR_NUMBER]
    expect(registration.accreditations[2026].statusTimeline).toEqual({
      '2026-01-01': { status: 'created' },
      '2026-03-01': { status: 'approved' },
      '2026-07-01': { status: 'approved' }
    })
  })

  it('serves the latest status on a day even when the history is stored out of order', async () => {
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

    const response = await get(`/organisations/${organisation.orgId}`)

    const registration = body(response).registrations[REPROCESSOR_NUMBER]
    expect(registration.accreditations[2026].statusTimeline).toEqual({
      '2026-01-01': { status: 'created' },
      '2026-03-01': { status: 'cancelled' },
      '2026-07-01': { status: 'approved' }
    })
  })

  it('serves an organisation as the repository stores it', async () => {
    const linked = buildLinkedDefraOrg(crypto.randomUUID(), 'Defra Org')
    const organisation = buildOrganisation({
      linkedDefraOrganisation: linked
    })
    await serveStored(organisation)

    const response = await get(`/organisations/${organisation.orgId}`)

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(body(response).linkedDefraOrganisation.linkedAt).toBe(
      linked.linkedAt
    )
  })

  it('returns 404 for an unknown organisation number', async () => {
    await serve(buildOrganisation({ orgId: 500001 }))

    const response = await get('/organisations/500002')

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('rejects an organisation number that is not a number', async () => {
    await serve(buildOrganisation())

    const response = await get('/organisations/not-a-number')

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  describe('authorisation', () => {
    const organisation = buildAccreditedOrganisation()
    const request = async () => {
      await serve(organisation)
      return { method: 'GET', url: `/organisations/${organisation.orgId}` }
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

  describe('with a year', () => {
    const urlFor = (organisation, year) =>
      `/organisations/${organisation.orgId}?year=${year}`

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-03-15') })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('serves the registrations approved in the year with that year’s accreditations', async () => {
      const organisation = buildAccreditedOrganisation()
      await serve(organisation)

      const response = await get(urlFor(organisation, 2026))

      expect(body(response).registrations).toEqual({
        [REPROCESSOR_NUMBER]: reprocessorResponse,
        [EXPORTER_NUMBER]: exporterResponse
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
            registration.status,
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
      expect(registration.status).toBe('approved')
      expect(registration.accreditations[2026].statusTimeline).toEqual({
        '2026-01-01': { status: 'approved' }
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
