import { StatusCodes } from 'http-status-codes'
import { describe, expect, it } from 'vitest'

import {
  REGISTRATION_NUMBER,
  buildFutureAccreditation
} from '#future-accreditations/repository/contract/test-data.js'
import { createInMemoryFutureAccreditationsRepository } from '#future-accreditations/repository/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

const { registrationNumber, year, ...payload } = buildFutureAccreditation()

/** @param {{ devEndpoints: boolean }} featureFlags */
const serverWith = async (featureFlags) => {
  const futureAccreditationsRepository =
    createInMemoryFutureAccreditationsRepository()()
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
    expect(
      await futureAccreditationsRepository.findByRegistrationNumbers([
        REGISTRATION_NUMBER
      ])
    ).toStrictEqual([buildFutureAccreditation()])
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
