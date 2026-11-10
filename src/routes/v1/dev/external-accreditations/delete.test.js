import { StatusCodes } from 'http-status-codes'
import { describe, expect, it } from 'vitest'

import { buildExternalAccreditation } from '#organisation-read-model/repository/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { createMockExternalAccreditationsRepository } from '#test/mock-repositories.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

const held = buildExternalAccreditation()
const url = `/v1/dev/external-accreditations/${held.registrationNumber}/${held.year}`

/**
 * @param {{ devEndpoints: boolean }} featureFlags
 * @param {import('#organisation-read-model/repository/to-read-model.js').ExternalAccreditation | null} removed
 */
const serverWith = async (featureFlags, removed) => {
  const externalAccreditationsRepository =
    createMockExternalAccreditationsRepository({
      remove: vi.fn(async () => removed)
    })
  const server = await createTestServer({
    config: { featureFlags },
    repositories: { externalAccreditationsRepository }
  })
  return { server, externalAccreditationsRepository }
}

describe('DELETE /v1/dev/external-accreditations/{registrationNumber}/{year}', () => {
  setupAuthContext()

  it('does not exist when dev endpoints are off', async () => {
    const { server } = await serverWith({ devEndpoints: false }, held)

    const response = await server.inject({ method: 'DELETE', url })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('removes the accreditation held for the registration and year', async () => {
    const { server, externalAccreditationsRepository } = await serverWith(
      { devEndpoints: true },
      held
    )

    const response = await server.inject({ method: 'DELETE', url })

    expect(response.statusCode).toBe(StatusCodes.NO_CONTENT)
    expect(externalAccreditationsRepository.remove).toHaveBeenCalledWith(
      held.registrationNumber,
      held.year
    )
  })

  it('is not found when no accreditation is held for that year', async () => {
    const { server, externalAccreditationsRepository } = await serverWith(
      { devEndpoints: true },
      null
    )

    const response = await server.inject({ method: 'DELETE', url })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    expect(externalAccreditationsRepository.remove).toHaveBeenCalled()
  })
})
