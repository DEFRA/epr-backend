import { StatusCodes } from 'http-status-codes'
import { buildOverseasSite } from '#overseas-sites/repository/contract/test-data.js'
import { asServiceMaintainer } from '#test/inject-auth.js'
import { it } from '#vite/fixtures/server.js'

describe('server fixture', () => {
  const unknownSiteUrl = '/v1/overseas-sites/aaaaaaaaaaaaaaaaaaaaaaaa'

  it('should serve requests once started', async ({ server }) => {
    const response = await server.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(StatusCodes.OK)
  })

  it('should serve what a test seeds through server.app', async ({
    server
  }) => {
    const site =
      await server.app.overseasSitesRepository.create(buildOverseasSite())

    const response = await server.inject({
      method: 'GET',
      url: `/v1/overseas-sites/${site.id}`,
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
  })

  it('should start each test with empty repositories', async ({ server }) => {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/overseas-sites',
      ...asServiceMaintainer()
    })

    expect(JSON.parse(response.payload)).toStrictEqual([])
  })

  it('should leave dev endpoints off by default', async ({ server }) => {
    const response = await server.inject({
      method: 'DELETE',
      url: '/v1/dev/organisations/0'
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  describe('with config overridden', () => {
    it.override({ config: { featureFlags: { devEndpoints: true } } })

    it('should build the server from that config', async ({ server }) => {
      const response = await server.inject({
        method: 'DELETE',
        url: '/v1/dev/organisations/0'
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })

  describe('with a repository overridden', () => {
    it.override({
      repositories: {
        overseasSitesRepository: () => ({
          findById: async () => {
            throw new Error('stubbed')
          }
        })
      }
    })

    it('should serve from that repository', async ({ server }) => {
      const response = await server.inject({
        method: 'GET',
        url: unknownSiteUrl,
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    })
  })

  it.for([
    'formSubmissionsRepository',
    'ledgerRepository',
    'orsImportsRepository',
    'organisationsRepository',
    'overseasSitesRepository',
    'packagingRecyclingNotesRepository',
    'publicRegisterRepository',
    'reportsRepository',
    'summaryLogRowStatesRepository',
    'summaryLogsRepository',
    'systemLogsRepository',
    'uploadsRepository'
  ])(
    'should give routes the %s on server.app, so tests can seed and spy on it',
    async (name, { server }) => {
      server.route({
        method: 'GET',
        path: '/canary',
        options: { auth: false },
        handler: (request) => ({ same: request[name] === server.app[name] })
      })

      const response = await server.inject({ method: 'GET', url: '/canary' })

      expect(JSON.parse(response.payload)).toStrictEqual({ same: true })
    }
  )
})
