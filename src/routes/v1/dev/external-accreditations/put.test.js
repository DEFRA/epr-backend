import { StatusCodes } from 'http-status-codes'
import { describe, expect, it } from 'vitest'

import { toRegistrationNumber } from '#domain/organisations/numbers.js'
import {
  EXPORTER_NUMBER,
  REPROCESSOR_NUMBER,
  exporter,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import { buildExternalAccreditation } from '#organisation-read-model/repository/contract/test-data.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { createMockExternalAccreditationsRepository } from '#test/mock-repositories.js'
import { organisationReadRepositoryOf } from '#vite/helpers/organisation-read-model.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

const { buildOrganisation } = createOrganisationBuilders()

const {
  registrationNumber,
  year,
  status: { timeline },
  ...fields
} = buildExternalAccreditation()
const payload = { ...fields, status: { timeline } }
const url = `/v1/dev/external-accreditations/${registrationNumber}/${year}`

/** @param {string} number */
const urlFor = (number) => `/v1/dev/external-accreditations/${number}/${year}`

const overseasSites = {
  '001': { status: 'approved', approvedOn: '2027-01-01' },
  '002': { status: 'pending' }
}

/** @param {{ devEndpoints: boolean }} featureFlags */
const serverWith = async (featureFlags) => {
  const externalAccreditationsRepository =
    createMockExternalAccreditationsRepository({
      upsert: vi.fn(async (accreditation) => accreditation)
    })
  const server = await createTestServer({
    config: { featureFlags },
    repositories: {
      externalAccreditationsRepository,
      organisationReadRepository: await organisationReadRepositoryOf([
        buildOrganisation({ registrations: [reprocessor(), exporter()] })
      ])
    }
  })
  return { server, externalAccreditationsRepository }
}

describe('PUT /v1/dev/external-accreditations/{registrationNumber}/{year}', () => {
  setupAuthContext()

  it('does not exist when dev endpoints are off', async () => {
    const { server } = await serverWith({ devEndpoints: false })

    const response = await server.inject({ method: 'PUT', url, payload })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('stores the accreditation for the registration and year', async () => {
    const { server, externalAccreditationsRepository } = await serverWith({
      devEndpoints: true
    })

    const response = await server.inject({ method: 'PUT', url, payload })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(response.result).toStrictEqual(buildExternalAccreditation())
    expect(externalAccreditationsRepository.upsert).toHaveBeenCalledWith(
      buildExternalAccreditation()
    )
  })

  it('stores the timeline oldest first, with the latest change as the current status', async () => {
    const { server, externalAccreditationsRepository } = await serverWith({
      devEndpoints: true
    })
    const approved = {
      status: 'approved',
      at: '2027-01-01T00:00:00.000Z',
      updatedAt: '2026-12-14T10:31:00.000Z'
    }
    const suspended = {
      status: 'suspended',
      at: '2027-03-01T00:00:00.000Z',
      updatedAt: '2027-03-01T00:00:00.000Z'
    }

    await server.inject({
      method: 'PUT',
      url,
      payload: { ...payload, status: { timeline: [suspended, approved] } }
    })

    expect(externalAccreditationsRepository.upsert).toHaveBeenCalledWith(
      buildExternalAccreditation({
        status: { current: 'suspended', timeline: [approved, suspended] }
      })
    )
  })

  it("stores an exporter accreditation's overseas sites", async () => {
    const { server, externalAccreditationsRepository } = await serverWith({
      devEndpoints: true
    })
    const exporterAccreditation = buildExternalAccreditation({
      registrationNumber: toRegistrationNumber(EXPORTER_NUMBER),
      overseasSites
    })

    const response = await server.inject({
      method: 'PUT',
      url: urlFor(EXPORTER_NUMBER),
      payload: { ...payload, overseasSites }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(response.result).toStrictEqual(exporterAccreditation)
    expect(externalAccreditationsRepository.upsert).toHaveBeenCalledWith(
      exporterAccreditation
    )
  })

  it.for([
    {
      description: "overseas sites for a reprocessor's accreditation",
      number: REPROCESSOR_NUMBER
    },
    {
      description:
        'overseas sites for an accreditation whose registration no organisation holds',
      number: registrationNumber
    }
  ])('refuses $description', async ({ number }) => {
    const { server, externalAccreditationsRepository } = await serverWith({
      devEndpoints: true
    })

    const response = await server.inject({
      method: 'PUT',
      url: urlFor(number),
      payload: { ...payload, overseasSites }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(externalAccreditationsRepository.upsert).not.toHaveBeenCalled()
  })

  it.for([
    {
      description: 'an approved overseas site without its approval date',
      overseasSites: { '001': { status: 'approved' } }
    },
    {
      description: 'an overseas site in a status sites do not have',
      overseasSites: { '001': { status: 'rejected' } }
    }
  ])('refuses $description', async ({ overseasSites }) => {
    const { server, externalAccreditationsRepository } = await serverWith({
      devEndpoints: true
    })

    const response = await server.inject({
      method: 'PUT',
      url: urlFor(EXPORTER_NUMBER),
      payload: { ...payload, overseasSites }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(externalAccreditationsRepository.upsert).not.toHaveBeenCalled()
  })

  it.for([
    {
      description: 'an empty timeline',
      status: { timeline: [] }
    },
    {
      description: 'a current status alongside the timeline',
      status: { current: 'approved', timeline }
    },
    {
      description: 'a status change with no date it was recorded',
      status: {
        timeline: [{ status: 'approved', at: '2027-01-01T00:00:00.000Z' }]
      }
    }
  ])('refuses $description', async ({ status }) => {
    const { server, externalAccreditationsRepository } = await serverWith({
      devEndpoints: true
    })

    const response = await server.inject({
      method: 'PUT',
      url,
      payload: { ...payload, status }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(externalAccreditationsRepository.upsert).not.toHaveBeenCalled()
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
    const { server, externalAccreditationsRepository } = await serverWith({
      devEndpoints: true
    })

    const response = await server.inject({
      method: 'PUT',
      url,
      payload: {
        ...payload,
        status: {
          timeline: [
            {
              status: 'approved',
              at: '2027',
              updatedAt: '2026-12-14T10:31:00.000Z'
            }
          ]
        }
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(externalAccreditationsRepository.upsert).not.toHaveBeenCalled()
  })
})
