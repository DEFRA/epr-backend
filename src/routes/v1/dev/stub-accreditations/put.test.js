import { StatusCodes } from 'http-status-codes'
import { describe, expect, it } from 'vitest'

import { buildFutureAccreditation } from '#future-accreditations/repository/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { createMockFutureAccreditationsRepository } from '#test/mock-repositories.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

const { registrationNumber, year, ...payload } = buildFutureAccreditation()

/** @param {{ devEndpoints: boolean }} featureFlags */
const serverWith = async (featureFlags) => {
  const futureAccreditationsRepository =
    createMockFutureAccreditationsRepository({
      upsert: vi.fn(async (accreditation) => accreditation)
    })
  const server = await createTestServer({
    config: { featureFlags },
    repositories: { futureAccreditationsRepository }
  })
  return { server, futureAccreditationsRepository }
}

describe('PUT /v1/dev/stub-accreditations/{registrationNumber}/{year}', () => {
  setupAuthContext()

  it('should not exist when dev endpoints are off', async () => {
    const { server } = await serverWith({ devEndpoints: false })

    const response = await server.inject({
      method: 'PUT',
      url: `/v1/dev/stub-accreditations/${registrationNumber}/${year}`,
      payload
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('should store the accreditation for the registration and year', async () => {
    const { server, futureAccreditationsRepository } = await serverWith({
      devEndpoints: true
    })

    const response = await server.inject({
      method: 'PUT',
      url: `/v1/dev/stub-accreditations/${registrationNumber}/${year}`,
      payload
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(response.result).toStrictEqual(buildFutureAccreditation())
    expect(futureAccreditationsRepository.upsert).toHaveBeenCalledWith(
      buildFutureAccreditation()
    )
  })

  it('should refuse a year that is not a number', async () => {
    const { server } = await serverWith({ devEndpoints: true })

    const response = await server.inject({
      method: 'PUT',
      url: `/v1/dev/stub-accreditations/${registrationNumber}/next`,
      payload
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('should refuse a request without an accreditation', async () => {
    const { server } = await serverWith({ devEndpoints: true })

    const response = await server.inject({
      method: 'PUT',
      url: `/v1/dev/stub-accreditations/${registrationNumber}/${year}`
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('should refuse an accreditation the stub cannot hold', async () => {
    const { server } = await serverWith({ devEndpoints: true })

    const response = await server.inject({
      method: 'PUT',
      url: `/v1/dev/stub-accreditations/${registrationNumber}/${year}`,
      payload: { ...payload, prnIssuance: { tonnageBand: 'lots' } }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })
})
