import Boom from '@hapi/boom'
import Joi from 'joi'

import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { partialMock } from '#test/type-helpers.js'
import { atNaturalKeys } from './at-natural-keys.js'
import { organisationParams } from '#shared/organisations/natural-keys.js'

const { buildOrganisation } = createOrganisationBuilders()

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { NaturalKeyResponse } from './at-natural-keys.js'
 */

const organisation = buildOrganisation()

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
    organisationLinkingRepository: createInMemoryOrganisationsRepository([
      partialMock(organisation)
    ])()
  })

const h = partialMock({})

describe('atNaturalKeys', () => {
  it('keeps the route options and swaps the params validation', () => {
    const served = atNaturalKeys(route, '/served', organisationParams)

    expect(served).toMatchObject({
      method: 'GET',
      path: '/served',
      options: { auth: scopes, validate: { payload: payloadSchema } }
    })
    expect(
      served.options.validate.params.validate({
        organisationNumber: organisation.organisationNumber
      }).error
    ).toBeUndefined()
  })

  it('serves a route that has no validation of its own', () => {
    const served = atNaturalKeys(
      { ...route, options: { auth: scopes } },
      '/served',
      organisationParams
    )

    expect(served.options.validate.params).toBeDefined()
  })

  it('passes the organisation id to the handler', async () => {
    const served = atNaturalKeys(route, '/served', organisationParams)

    const params = await served.handler(
      requestFor({ organisationNumber: organisation.organisationNumber }),
      h
    )

    expect(params).toEqual({
      organisationNumber: organisation.organisationNumber,
      organisationId: organisation.id
    })
  })

  it('puts the organisation it resolved on the request', async () => {
    const served = atNaturalKeys(route, '/served', organisationParams)
    const request = requestFor({
      organisationNumber: organisation.organisationNumber
    })

    await served.handler(request, h)

    expect(request.app).toEqual({
      storedOrganisation: expect.objectContaining({ id: organisation.id })
    })
  })

  it('runs the before step with the organisation id, before the handler', async () => {
    const calls = []
    const before = vi.fn((request) => {
      calls.push(['before', request.params.organisationId])
    })
    const handler = vi.fn(async () => calls.push(['handler']))
    const served = atNaturalKeys(
      { ...route, handler },
      '/served',
      organisationParams,
      { before }
    )

    await served.handler(
      requestFor({ organisationNumber: organisation.organisationNumber }),
      h
    )

    expect(calls).toEqual([['before', organisation.id], ['handler']])
  })

  it('rejects an unknown organisation as not found', async () => {
    const served = atNaturalKeys(route, '/served', organisationParams)

    await expect(
      served.handler(requestFor({ organisationNumber: '999999' }), h)
    ).rejects.toMatchObject({ output: { statusCode: 404 } })
  })

  describe('with a respond option', () => {
    const servedPath = '/organisations/{organisationNumber}'
    const url = `/organisations/${organisation.organisationNumber}`
    const mappedSchema = Joi.object({
      mapped: Joi.string().required(),
      organisationId: Joi.string().required()
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
        'organisationLinkingRepository',
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
        organisationParams,
        {
          respond: respondWith((request, h, response) =>
            h
              .response({
                mapped: /** @type {{ raw: string }} */ (response.source).raw,
                organisationId: request.params.organisationId
              })
              .code(201)
          )
        }
      )

      const response = await serve(served)

      expect(response.statusCode).toBe(201)
      expect(JSON.parse(response.payload)).toEqual({
        mapped: 'body',
        organisationId: organisation.id
      })
    })

    it('waits for an async map', async () => {
      const served = atNaturalKeys(
        unmappedRoute,
        servedPath,
        organisationParams,
        {
          respond: respondWith(async (request, h) =>
            h.response({
              mapped: 'later',
              organisationId: request.params.organisationId
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
        organisationParams,
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
        organisationParams,
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
        organisationParams,
        { respond: respondWith(map) }
      )

      const response = await serve(served)

      expect(response.statusCode).toBe(409)
      expect(map).not.toHaveBeenCalled()
    })
  })
})
