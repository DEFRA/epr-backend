import Boom from '@hapi/boom'
import Joi from 'joi'

import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { partialMock } from '#test/type-helpers.js'
import { atNaturalKeys } from './at-natural-keys.js'
import {
  REPROCESSOR_NUMBER,
  accreditation,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import { organisationParams, registrationParams } from './view-route.js'

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { NaturalKeyResponse } from './at-natural-keys.js'
 */

const REGISTERED_ONLY_NUMBER = 'R26ER5001180099PL'

const accredited = accreditation()
const registeredOnlyRegistration = reprocessor({
  registrationNumber: REGISTERED_ONLY_NUMBER
})
const accreditedRegistration = reprocessor({ accreditationId: accredited.id })
const organisation = buildOrganisation({
  registrations: [registeredOnlyRegistration, accreditedRegistration],
  accreditations: [accredited]
})

const scopes = { scope: ['organisation:read'] }
const payloadSchema = Joi.object({ name: Joi.string() })

const route = {
  method: 'GET',
  options: { auth: scopes, validate: { payload: payloadSchema } },
  handler: vi.fn(async (request) => request.params)
}

/**
 * @param {object} params
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

describe('atNaturalKeys', () => {
  it('keeps the route options and swaps the params validation', () => {
    const served = atNaturalKeys(route, '/served', registrationParams)

    expect(served).toMatchObject({
      method: 'GET',
      path: '/served',
      options: { auth: scopes, validate: { payload: payloadSchema } }
    })
    expect(
      served.options.validate.params.validate({
        organisationNumber: organisation.orgId,
        registrationNumber: REPROCESSOR_NUMBER
      }).error
    ).toBeUndefined()
  })

  it('serves a route that has no validation of its own', () => {
    const served = atNaturalKeys(
      { ...route, options: { auth: scopes } },
      '/served',
      registrationParams
    )

    expect(served.options.validate.params).toBeDefined()
  })

  it('passes the stored ids to the handler, with no accreditation', async () => {
    const served = atNaturalKeys(route, '/served', registrationParams)

    const params = await served.handler(
      requestFor({
        organisationNumber: organisation.orgId,
        registrationNumber: REGISTERED_ONLY_NUMBER
      }),
      h
    )

    expect(params).toMatchObject({
      organisationId: organisation.id,
      registrationId: registeredOnlyRegistration.id,
      accreditationId: null
    })
  })

  it("passes the accreditation for the year to an accredited route's handler", async () => {
    const served = atNaturalKeys(route, '/served', registrationParams, {
      accredited: true
    })

    const params = await served.handler(
      requestFor({
        organisationNumber: organisation.orgId,
        registrationNumber: REPROCESSOR_NUMBER,
        year: 2026
      }),
      h
    )

    expect(params).toMatchObject({
      registrationId: accreditedRegistration.id,
      accreditationId: accredited.id
    })
  })

  it('passes the organisation alone to an organisation route', async () => {
    const served = atNaturalKeys(route, '/served', organisationParams)

    const params = await served.handler(
      requestFor({ organisationNumber: organisation.orgId }),
      h
    )

    expect(params).toEqual({
      organisationNumber: organisation.orgId,
      organisationId: organisation.id
    })
  })

  it('puts the records it resolved on the request', async () => {
    const served = atNaturalKeys(route, '/served', registrationParams)
    const request = requestFor({
      organisationNumber: organisation.orgId,
      registrationNumber: REGISTERED_ONLY_NUMBER
    })

    await served.handler(request, h)

    expect(request.app).toEqual({
      organisation: expect.objectContaining({ id: organisation.id }),
      registration: expect.objectContaining({
        id: registeredOnlyRegistration.id
      })
    })
  })

  it('runs the before step with the stored ids, before the handler', async () => {
    const calls = []
    const before = vi.fn((request) => {
      calls.push(['before', request.params.registrationId])
    })
    const handler = vi.fn(async () => calls.push(['handler']))
    const served = atNaturalKeys(
      { ...route, handler },
      '/served',
      registrationParams,
      { before }
    )

    await served.handler(
      requestFor({
        organisationNumber: organisation.orgId,
        registrationNumber: REGISTERED_ONLY_NUMBER
      }),
      h
    )

    expect(calls).toEqual([
      ['before', registeredOnlyRegistration.id],
      ['handler']
    ])
  })

  it.each([
    [
      'an unknown organisation',
      { organisationNumber: 999999, registrationNumber: REPROCESSOR_NUMBER },
      false
    ],
    [
      'an unknown registration',
      {
        organisationNumber: organisation.orgId,
        registrationNumber: 'R26XX0000000000PL'
      },
      false
    ],
    [
      'a year the registration has no accreditation for',
      {
        organisationNumber: organisation.orgId,
        registrationNumber: REPROCESSOR_NUMBER,
        year: 2027
      },
      true
    ],
    [
      'a registration with no accreditation',
      {
        organisationNumber: organisation.orgId,
        registrationNumber: REGISTERED_ONLY_NUMBER,
        year: 2026
      },
      true
    ]
  ])('rejects %s as not found', async (_, params, isAccredited) => {
    const served = atNaturalKeys(route, '/served', registrationParams, {
      accredited: isAccredited
    })

    await expect(served.handler(requestFor(params), h)).rejects.toMatchObject({
      output: { statusCode: 404 }
    })
  })

  describe('with a respond option', () => {
    const servedPath =
      '/organisations/{organisationNumber}/registrations/{registrationNumber}'
    const url = `/organisations/${organisation.orgId}/registrations/${REGISTERED_ONLY_NUMBER}`
    const mappedSchema = Joi.object({
      mapped: Joi.string().required(),
      registrationId: Joi.string().required()
    })
    const failAction = () => {
      throw Boom.teapot()
    }

    const unmappedRoute = {
      method: 'GET',
      options: { response: { schema: Joi.object({ raw: Joi.string() }) } },
      handler: vi.fn(async (_request, h) =>
        h.response({ raw: 'body' }).code(200)
      )
    }

    /**
     * @param {ReturnType<typeof atNaturalKeys>} served
     */
    const serve = async (served) => {
      const { default: Hapi } = await import('@hapi/hapi')
      const server = Hapi.server()
      server.validator(Joi)
      server.decorate(
        'request',
        'organisationsRepository',
        createInMemoryOrganisationsRepository([partialMock(organisation)])()
      )
      server.route(/** @type {ServerRoute} */ (served))
      return server.inject({ method: 'GET', url })
    }

    /**
     * @param {NaturalKeyResponse['map']} map
     * @returns {NaturalKeyResponse}
     */
    const respondWith = (map) => ({ schema: mappedSchema, failAction, map })

    it('serves what map returns, with its status code', async () => {
      const served = atNaturalKeys(
        unmappedRoute,
        servedPath,
        registrationParams,
        {
          respond: respondWith((request, h, response) =>
            h
              .response({
                mapped: /** @type {{ raw: string }} */ (response.source).raw,
                registrationId: request.params.registrationId
              })
              .code(201)
          )
        }
      )

      const response = await serve(served)

      expect(response.statusCode).toBe(201)
      expect(JSON.parse(response.payload)).toEqual({
        mapped: 'body',
        registrationId: registeredOnlyRegistration.id
      })
    })

    it('waits for an async map', async () => {
      const served = atNaturalKeys(
        unmappedRoute,
        servedPath,
        registrationParams,
        {
          respond: respondWith(async (request, h) =>
            h.response({
              mapped: 'later',
              registrationId: request.params.registrationId
            })
          )
        }
      )

      const response = await serve(served)

      expect(JSON.parse(response.payload)).toMatchObject({ mapped: 'later' })
    })

    it('checks the mapped body against its own schema and fail action', async () => {
      const served = atNaturalKeys(
        unmappedRoute,
        servedPath,
        registrationParams,
        {
          respond: respondWith((_request, h) => h.response({ raw: 'body' }))
        }
      )

      const response = await serve(served)

      expect(response.statusCode).toBe(418)
    })

    it('leaves the wrapped route its own response options', () => {
      const ownResponse = unmappedRoute.options.response

      const served = atNaturalKeys(
        unmappedRoute,
        servedPath,
        registrationParams,
        {
          respond: respondWith((_request, h) => h.response({}))
        }
      )

      expect(unmappedRoute.options.response).toBe(ownResponse)
      expect(served.options.response).toEqual({
        schema: mappedSchema,
        failAction
      })
    })

    it('passes a handler error through without mapping', async () => {
      const map = vi.fn()
      const served = atNaturalKeys(
        {
          ...unmappedRoute,
          handler: vi.fn(async () => {
            throw Boom.conflict()
          })
        },
        servedPath,
        registrationParams,
        { respond: respondWith(map) }
      )

      const response = await serve(served)

      expect(response.statusCode).toBe(409)
      expect(map).not.toHaveBeenCalled()
    })
  })

  it('rejects an unknown organisation on an organisation route', async () => {
    const served = atNaturalKeys(route, '/served', organisationParams)

    await expect(
      served.handler(requestFor({ organisationNumber: 999999 }), h)
    ).rejects.toMatchObject({ output: { statusCode: 404 } })
  })
})
