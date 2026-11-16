import { StatusCodes } from 'http-status-codes'

import { config } from '#root/config.js'
import { createTestServer } from '#test/create-test-server.js'
import {
  asRegulator,
  asServiceMaintainer,
  asUnscopedAdminUser
} from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

const url = '/waste-records/years'

describe('GET /waste-records/years', () => {
  setupAuthContext()

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-16') })
  })

  afterEach(() => {
    vi.useRealTimers()
    config.reset('openNextYear')
  })

  it('lists the years waste records can be held for, newest first', async () => {
    config.set('openNextYear', true)
    const server = await createTestServer()

    const response = await server.inject({
      method: 'GET',
      url,
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toEqual({
      years: [{ year: 2027 }, { year: 2026 }]
    })
  })

  it('serves a regulator', async () => {
    const server = await createTestServer()

    const response = await server.inject({
      method: 'GET',
      url,
      ...asRegulator()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toEqual({ years: [{ year: 2026 }] })
  })

  it('returns 401 when not authenticated', async () => {
    const server = await createTestServer()

    const response = await server.inject({ method: 'GET', url })

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
  })

  it('returns 403 for a caller holding neither read scope', async () => {
    const server = await createTestServer()

    const response = await server.inject({
      method: 'GET',
      url,
      ...asUnscopedAdminUser()
    })

    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
  })
})
