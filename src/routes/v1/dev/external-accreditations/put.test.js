import { StatusCodes } from 'http-status-codes'
import { describe, expect, it } from 'vitest'

import { buildExternalAccreditation } from '#organisation-read-model/repository/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { createMockExternalAccreditationsRepository } from '#test/mock-repositories.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

const { registrationNumber, year, ...payload } = buildExternalAccreditation()
const url = `/v1/dev/external-accreditations/${registrationNumber}/${year}`

/** @param {{ devEndpoints: boolean }} featureFlags */
const serverWith = async (featureFlags) => {
  const externalAccreditationsRepository =
    createMockExternalAccreditationsRepository({
      upsert: vi.fn(async (accreditation) => accreditation)
    })
  const server = await createTestServer({
    config: { featureFlags },
    repositories: { externalAccreditationsRepository }
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
          current: 'approved',
          timeline: [{ status: 'approved', at: '2027' }]
        }
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(externalAccreditationsRepository.upsert).not.toHaveBeenCalled()
  })
})
