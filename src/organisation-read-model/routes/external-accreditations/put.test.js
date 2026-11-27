import { StatusCodes } from 'http-status-codes'
import { describe, expect, it } from 'vitest'

import {
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import {
  EXPORTER_NUMBER,
  REPROCESSOR_NUMBER,
  buildExternalAccreditation,
  createInMemoryExternalAccreditationsRepository,
  createInMemoryOrganisationReadRepository,
  buildReadExporterRegistration,
  buildReadOrganisation,
  buildReadReprocessorRegistration
} from '#organisation-read-model/test-support.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

const {
  registrationNumber,
  year,
  status: { current: _current, ...status },
  ...fields
} = buildExternalAccreditation()
const payload = { ...fields, status }
const url = `/v1/dev/external-accreditations/${registrationNumber}/${year}`

/** @param {string} number */
const urlFor = (number) => `/v1/dev/external-accreditations/${number}/${year}`

/** A registration only another organisation holds. */
const OTHER_ORGANISATIONS_NUMBER = toRegistrationNumber('R26ER5009990001PL')

/** @import { ExternalAccreditation } from '#organisation-read-model/index.js' */

/**
 * A server whose external accreditations repository holds what it stores in
 * `held`.
 *
 * @param {{ devEndpoints: boolean }} featureFlags
 */
const serverWith = async (featureFlags) => {
  /** @type {ExternalAccreditation[]} */
  const held = []
  const server = await createTestServer({
    config: { featureFlags },
    repositories: {
      externalAccreditationsRepository:
        createInMemoryExternalAccreditationsRepository(held),
      organisationReadRepository: createInMemoryOrganisationReadRepository([
        buildReadOrganisation({
          organisationNumber: fields.organisationNumber,
          registrations: {
            [registrationNumber]: buildReadReprocessorRegistration(),
            [REPROCESSOR_NUMBER]: buildReadReprocessorRegistration(),
            [EXPORTER_NUMBER]: buildReadExporterRegistration()
          }
        }),
        buildReadOrganisation({
          registrations: {
            [OTHER_ORGANISATIONS_NUMBER]: buildReadReprocessorRegistration()
          }
        })
      ])
    }
  })
  return { server, held }
}

describe('PUT /v1/dev/external-accreditations/{registrationNumber}/{year}', () => {
  setupAuthContext()

  it('does not exist when dev endpoints are off', async () => {
    const { server } = await serverWith({ devEndpoints: false })

    const response = await server.inject({ method: 'PUT', url, payload })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('stores the accreditation for the registration and year', async () => {
    const { server, held } = await serverWith({
      devEndpoints: true
    })

    const response = await server.inject({ method: 'PUT', url, payload })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(response.result).toStrictEqual(buildExternalAccreditation())
    expect(held).toStrictEqual([buildExternalAccreditation()])
  })

  it('stores the timeline oldest first, with the latest change as the current status', async () => {
    const { server, held } = await serverWith({
      devEndpoints: true
    })
    const approved = {
      status: /** @type {const} */ ('approved'),
      at: '2027-01-01T00:00:00.000Z'
    }
    const suspended = {
      status: /** @type {const} */ ('suspended'),
      at: '2027-03-01T00:00:00.000Z'
    }
    const lastUpdatedAt = '2027-03-01T00:00:00.000Z'

    await server.inject({
      method: 'PUT',
      url,
      payload: {
        ...payload,
        status: { lastUpdatedAt, timeline: [suspended, approved] }
      }
    })

    expect(held).toStrictEqual([
      buildExternalAccreditation({
        status: {
          current: 'suspended',
          lastUpdatedAt,
          timeline: [approved, suspended]
        }
      })
    ])
  })

  it("stores an exporter's accreditation without overseas sites, as they are lifted from the registration", async () => {
    const { server, held } = await serverWith({
      devEndpoints: true
    })
    const exporterAccreditation = buildExternalAccreditation({
      registrationNumber: toRegistrationNumber(EXPORTER_NUMBER)
    })

    const response = await server.inject({
      method: 'PUT',
      url: urlFor(EXPORTER_NUMBER),
      payload
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(response.result).toStrictEqual(exporterAccreditation)
    expect(held).toStrictEqual([exporterAccreditation])
  })

  it('refuses an accreditation with overseas sites', async () => {
    const { server, held } = await serverWith({
      devEndpoints: true
    })

    const response = await server.inject({
      method: 'PUT',
      url: urlFor(EXPORTER_NUMBER),
      payload: {
        ...payload,
        overseasSites: {
          '001': { status: 'approved', approvedOn: '2027-01-01' }
        }
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(JSON.parse(response.payload).message).toBe(
      '"overseasSites" is not allowed'
    )
    expect(held).toStrictEqual([])
  })

  it.for([
    {
      description: 'a registration only another organisation holds',
      number: OTHER_ORGANISATIONS_NUMBER,
      organisationNumber: fields.organisationNumber
    },
    {
      description: 'a registration no organisation holds',
      number: 'R26ER5009990002PL',
      organisationNumber: fields.organisationNumber
    },
    {
      description: 'an organisation that does not exist',
      number: REPROCESSOR_NUMBER,
      organisationNumber: toOrganisationNumber('999999999')
    }
  ])(
    'refuses an accreditation for $description',
    async ({ number, organisationNumber }) => {
      const { server, held } = await serverWith({
        devEndpoints: true
      })

      const response = await server.inject({
        method: 'PUT',
        url: urlFor(number),
        payload: { ...payload, organisationNumber }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      expect(JSON.parse(response.payload).message).toBe(
        `Organisation ${organisationNumber} holds no registration ${number}`
      )
      expect(held).toStrictEqual([])
    }
  )

  it.for([
    {
      description: 'an empty timeline',
      status: { ...status, timeline: [] }
    },
    {
      description: 'a current status alongside the timeline',
      status: { ...status, current: 'approved' }
    },
    {
      description: 'no date its last change was recorded',
      status: { timeline: status.timeline }
    },
    {
      description: 'a status change that carries when it was recorded',
      status: {
        ...status,
        timeline: [
          {
            status: 'approved',
            at: '2027-01-01T00:00:00.000Z',
            updatedAt: '2026-12-14T10:31:00.000Z'
          }
        ]
      }
    }
  ])('refuses $description', async ({ status }) => {
    const { server, held } = await serverWith({
      devEndpoints: true
    })

    const response = await server.inject({
      method: 'PUT',
      url,
      payload: { ...payload, status }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(held).toStrictEqual([])
  })

  it.for([
    {
      description: 'an accreditation without its organisation number',
      organisationNumber: undefined
    },
    {
      description: 'an organisation number that is not a number',
      organisationNumber: 'ABC123'
    }
  ])('refuses $description', async ({ organisationNumber }) => {
    const { server, held } = await serverWith({
      devEndpoints: true
    })

    const response = await server.inject({
      method: 'PUT',
      url,
      payload: { ...payload, organisationNumber }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(held).toStrictEqual([])
  })

  it('refuses a year that is not a number', async () => {
    const { server } = await serverWith({ devEndpoints: true })

    const response = await server.inject({
      method: 'PUT',
      url: `/v1/dev/external-accreditations/${registrationNumber}/next`,
      payload
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it.for([2026, 2028])(
    'refuses %i, as the read model loads external accreditations for 2027 only',
    async (otherYear) => {
      const { server, held } = await serverWith({
        devEndpoints: true
      })

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/external-accreditations/${registrationNumber}/${otherYear}`,
        payload
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      expect(held).toStrictEqual([])
    }
  )

  it('refuses a request without an accreditation', async () => {
    const { server } = await serverWith({ devEndpoints: true })

    const response = await server.inject({ method: 'PUT', url })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('refuses a tonnage band the scheme does not have', async () => {
    const { server } = await serverWith({ devEndpoints: true })

    const response = await server.inject({
      method: 'PUT',
      url,
      payload: { ...payload, prnIssuance: { tonnageBand: 'lots' } }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('refuses a status change not timed as a UTC date-time', async () => {
    const { server, held } = await serverWith({
      devEndpoints: true
    })

    const response = await server.inject({
      method: 'PUT',
      url,
      payload: {
        ...payload,
        status: {
          ...status,
          timeline: [{ status: 'approved', at: '2027' }]
        }
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(held).toStrictEqual([])
  })
})
