import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import {
  asOperator,
  asRegulator,
  asServiceMaintainerRead
} from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { marketInsightsWasteBalancePath } from './waste-balance-get.js'

const injectTable = (server, credentials, query = '?year=2026') =>
  server.inject({
    method: 'GET',
    url: `${marketInsightsWasteBalancePath}${query}`,
    ...credentials
  })

describe(`GET ${marketInsightsWasteBalancePath}`, () => {
  setupAuthContext()

  let server

  beforeAll(async () => {
    server = await createTestServer({})
  })

  afterAll(async () => {
    await server.stop()
  })

  describe('access control', () => {
    it('returns 401 when unauthenticated', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${marketInsightsWasteBalancePath}?year=2026`
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 for an operator, who holds no market-data.read', async () => {
      const response = await injectTable(server, asOperator())

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('returns 200 for an admin tier, which holds market-data.read', async () => {
      const response = await injectTable(server, asServiceMaintainerRead())

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('returns 200 for a regulator, who holds market-data.read', async () => {
      const response = await injectTable(server, asRegulator())

      expect(response.statusCode).toBe(StatusCodes.OK)
    })
  })

  describe('the reporting year', () => {
    it('rejects a request that names no year', async () => {
      const response = await injectTable(server, asRegulator(), '')

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects a year that is not a year', async () => {
      const response = await injectTable(server, asRegulator(), '?year=twenty')

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('reports back the year it answered for', async () => {
      const response = await injectTable(server, asRegulator(), '?year=2027')

      expect(JSON.parse(response.payload).meta.reportingYear).toBe(2027)
    })
  })

  it('answers with an empty table when nothing has been submitted', async () => {
    const response = await injectTable(server, asRegulator())

    expect(response.statusCode).toBe(StatusCodes.OK)
    const body = JSON.parse(response.payload)
    expect(body.data).toEqual([])
    expect(typeof body.meta.generatedAt).toBe('string')
  })
})
