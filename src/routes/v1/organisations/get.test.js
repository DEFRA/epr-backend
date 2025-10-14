import { StatusCodes } from 'http-status-codes'
import { createServer } from '#server/server.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'

/** @typedef {import('#repositories/organistions/port.js').OrganisationsRepository} OrganisationsRepository */

describe('/v1/organisations route', () => {
  describe('success path', () => {
    /** @type {import('#common/hapi-types.js').HapiServer} */
    let server

    beforeAll(async () => {
      /** @type {OrganisationsRepository} */
      const organisationsRepository = {
        async findAll() {
          return [{ id: 'org-1', name: 'Org One' }]
        }
      }

      server = await createServer({
        repositories: { organisationsRepository },
        featureFlags: createInMemoryFeatureFlags({ organisations: true })
      })
      await server.initialize()
    })

    afterAll(async () => {
      await server?.stop()
    })

    it('returns 200 and the organisations when repository returns data', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/organisations'
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(response.result).toEqual([{ id: 'org-1', name: 'Org One' }])
    })
  })

  describe('not found path', () => {
    /** @type {import('#common/hapi-types.js').HapiServer} */
    let server

    beforeAll(async () => {
      /** @type {OrganisationsRepository} */
      const organisationsRepository = {
        async findAll() {
          return null
        }
      }

      server = await createServer({
        repositories: { organisationsRepository },
        featureFlags: createInMemoryFeatureFlags({ organisations: true })
      })
      await server.initialize()
    })

    afterAll(async () => {
      await server?.stop()
    })

    it('returns 404 when repository returns null', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/organisations'
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      expect(response.result).toEqual({ message: 'No organisations found' })
    })
  })
})
