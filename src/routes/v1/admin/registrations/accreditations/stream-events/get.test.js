import { describe, it, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'

import { buildStreamEvent } from '#waste-balances/repository/stream-test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { streamEventsGetPath } from './get.js'

const makePath = (regId, accId) =>
  streamEventsGetPath
    .replace('{registrationId}', regId)
    .replace('{accreditationId}', accId)

describe(`GET ${streamEventsGetPath}`, () => {
  setupAuthContext()

  let server
  let streamRepository

  beforeEach(async () => {
    server = await createTestServer()
    streamRepository = server.app.streamRepository
  })

  it('returns 200 with stream events for the partition', async () => {
    await streamRepository.appendEvents([
      buildStreamEvent({
        registrationId: 'reg-1',
        accreditationId: 'acc-1',
        organisationId: 'org-1',
        number: 1
      })
    ])

    const response = await server.inject({
      method: 'GET',
      url: makePath('reg-1', 'acc-1'),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result).toHaveLength(1)
    expect(result[0].number).toBe(1)
    expect(result[0].registrationId).toBe('reg-1')
  })

  it('returns events ordered by number ascending', async () => {
    await streamRepository.appendEvents([
      buildStreamEvent({
        registrationId: 'reg-2',
        accreditationId: 'acc-2',
        organisationId: 'org-2',
        number: 1
      })
    ])
    await streamRepository.appendEvents([
      buildStreamEvent({
        registrationId: 'reg-2',
        accreditationId: 'acc-2',
        organisationId: 'org-2',
        number: 2
      })
    ])

    const response = await server.inject({
      method: 'GET',
      url: makePath('reg-2', 'acc-2'),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result).toHaveLength(2)
    expect(result[0].number).toBe(1)
    expect(result[1].number).toBe(2)
  })

  it('returns an empty array when no events exist', async () => {
    const response = await server.inject({
      method: 'GET',
      url: makePath('reg-none', 'acc-none'),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result).toEqual([])
  })

  it('returns 401 when not authenticated', async () => {
    const response = await server.inject({
      method: 'GET',
      url: makePath('some-reg', 'some-acc')
    })

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
  })
})
