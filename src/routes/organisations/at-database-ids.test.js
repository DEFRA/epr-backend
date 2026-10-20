import Boom from '@hapi/boom'
import { ObjectId } from 'mongodb'

import {
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { partialMock } from '#test/type-helpers.js'
import { atDatabaseIds } from './at-database-ids.js'

/** @import { DatabaseIdParams } from './at-database-ids.js' */

const registration = buildRegistration({
  registrationNumber: 'R26ER5001180041PL'
})
const unnumberedRegistration = buildRegistration()
const organisation = buildOrganisation({
  registrations: [registration, unnumberedRegistration]
})

const route = {
  method: 'GET',
  path: '/organisations/{organisationId}/registrations/{registrationId}',
  options: { auth: { scope: ['admin:read'] } },
  handler: vi.fn(async (request) => request.params)
}

/**
 * @param {DatabaseIdParams} params
 */
const requestFor = (params) =>
  partialMock({
    app: {},
    params,
    organisationsRepository: createInMemoryOrganisationsRepository([
      partialMock(organisation)
    ])()
  })

const h = partialMock({})

/** @type {[string, DatabaseIdParams][]} */
const unknownRegistrations = [
  [
    'an unknown organisation',
    {
      organisationId: new ObjectId().toString(),
      registrationId: registration.id
    }
  ],
  [
    'an unknown registration',
    {
      organisationId: organisation.id,
      registrationId: new ObjectId().toString()
    }
  ],
  [
    'a registration with no number',
    {
      organisationId: organisation.id,
      registrationId: unnumberedRegistration.id
    }
  ]
]

describe('atDatabaseIds', () => {
  it('keeps the route as it is, at the same path', () => {
    const served = atDatabaseIds(route)

    expect(served).toMatchObject({
      method: route.method,
      path: route.path,
      options: route.options
    })
  })

  it('passes the natural keys to the handler', async () => {
    const params = await atDatabaseIds(route).handler(
      requestFor({
        organisationId: organisation.id,
        registrationId: registration.id
      }),
      h
    )

    expect(params).toEqual({
      organisationId: organisation.id,
      registrationId: registration.id,
      organisationNumber: organisation.orgId,
      registrationNumber: registration.registrationNumber
    })
  })

  it('puts the records it found on the request', async () => {
    const request = requestFor({
      organisationId: organisation.id,
      registrationId: registration.id
    })

    await atDatabaseIds(route).handler(request, h)

    expect(request.app).toEqual({
      organisation: expect.objectContaining({ id: organisation.id }),
      registration: expect.objectContaining({ id: registration.id })
    })
  })

  it.each(unknownRegistrations)(
    'answers not found for %s',
    async (_, params) => {
      await expect(
        atDatabaseIds(route).handler(requestFor(params), h)
      ).rejects.toThrow(Boom.notFound('Registration not found'))
    }
  )

  it.each(unknownRegistrations)(
    'gives %s to the unknown answer, when the route has one',
    async (_, params) => {
      const unknown = vi.fn(() => 'unknown')

      const response = await atDatabaseIds(route, { unknown }).handler(
        requestFor(params),
        h
      )

      expect(response).toBe('unknown')
      expect(unknown).toHaveBeenCalledWith(
        expect.objectContaining({ params }),
        h
      )
    }
  )

  it('passes on a failure to read the organisation', async () => {
    const request = requestFor({
      organisationId: organisation.id,
      registrationId: registration.id
    })
    request.organisationsRepository.findById = vi
      .fn()
      .mockRejectedValue(new Error('Simulated Database Failure'))

    await expect(atDatabaseIds(route).handler(request, h)).rejects.toThrow(
      'Simulated Database Failure'
    )
  })
})
