import { describe, it, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'

import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { buildStreamEvent } from '#waste-balances/repository/stream-test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { streamEventsGetPath } from './get.js'

const makePath = (orgId, accId) =>
  streamEventsGetPath
    .replace('{organisationId}', orgId)
    .replace('{accreditationId}', accId)

describe(`GET ${streamEventsGetPath}`, () => {
  setupAuthContext()

  let server
  let organisationsRepository
  let streamRepository

  beforeEach(async () => {
    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository([])
    organisationsRepository = organisationsRepositoryFactory()

    server = await createTestServer({
      repositories: {
        organisationsRepository: organisationsRepositoryFactory
      }
    })

    streamRepository = server.app.streamRepository
  })

  it('returns 200 with stream events for the accreditation', async () => {
    const accreditation = buildAccreditation()
    const registration = buildRegistration({
      accreditationId: accreditation.id
    })
    const org = buildOrganisation({
      registrations: [registration],
      accreditations: [accreditation]
    })
    await organisationsRepository.insert(org)

    await streamRepository.appendEvent(
      buildStreamEvent({
        registrationId: registration.id,
        accreditationId: accreditation.id,
        organisationId: org.id,
        number: 1
      })
    )

    const response = await server.inject({
      method: 'GET',
      url: makePath(org.id, accreditation.id),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result).toHaveLength(1)
    expect(result[0].number).toBe(1)
    expect(result[0].registrationId).toBe(registration.id)
  })

  it('returns events ordered by number ascending', async () => {
    const accreditation = buildAccreditation()
    const registration = buildRegistration({
      accreditationId: accreditation.id
    })
    const org = buildOrganisation({
      registrations: [registration],
      accreditations: [accreditation]
    })
    await organisationsRepository.insert(org)

    await streamRepository.appendEvent(
      buildStreamEvent({
        registrationId: registration.id,
        accreditationId: accreditation.id,
        organisationId: org.id,
        number: 1
      })
    )
    await streamRepository.appendEvent(
      buildStreamEvent({
        registrationId: registration.id,
        accreditationId: accreditation.id,
        organisationId: org.id,
        number: 2
      })
    )

    const response = await server.inject({
      method: 'GET',
      url: makePath(org.id, accreditation.id),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result).toHaveLength(2)
    expect(result[0].number).toBe(1)
    expect(result[1].number).toBe(2)
  })

  it('returns an empty array when no events exist', async () => {
    const accreditation = buildAccreditation()
    const registration = buildRegistration({
      accreditationId: accreditation.id
    })
    const org = buildOrganisation({
      registrations: [registration],
      accreditations: [accreditation]
    })
    await organisationsRepository.insert(org)

    const response = await server.inject({
      method: 'GET',
      url: makePath(org.id, accreditation.id),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result).toEqual([])
  })

  it('returns 404 when organisation does not exist', async () => {
    const response = await server.inject({
      method: 'GET',
      url: makePath('nonexistent-id', 'some-acc-id'),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('returns 404 when no registration links to the accreditation', async () => {
    const accreditation = buildAccreditation()
    const registration = buildRegistration()
    delete registration.accreditationId
    const org = buildOrganisation({
      registrations: [registration],
      accreditations: [accreditation]
    })
    await organisationsRepository.insert(org)

    const response = await server.inject({
      method: 'GET',
      url: makePath(org.id, accreditation.id),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('returns 401 when not authenticated', async () => {
    const response = await server.inject({
      method: 'GET',
      url: makePath('some-org', 'some-acc')
    })

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
  })
})
