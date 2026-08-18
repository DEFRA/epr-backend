import { describe, it, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'

import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { testLedgerEventsAccess } from '../ledger-events-test-helpers.js'
import { registrationLedgerEventsGetPath } from './get.js'

/**
 * @param {string} orgId
 * @param {string} regId
 */
const makePath = (orgId, regId) =>
  registrationLedgerEventsGetPath
    .replace('{organisationId}', orgId)
    .replace('{registrationId}', regId)

describe(`GET ${registrationLedgerEventsGetPath}`, () => {
  setupAuthContext()

  /** @type {import('#test/create-test-server.js').TestServer} */
  let server
  /** @type {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} */
  let ledgerRepository

  beforeEach(async () => {
    server = await createTestServer()
    ledgerRepository = server.app.ledgerRepository
  })

  it('returns 200 with the events of the ledger held with no accreditation', async () => {
    await ledgerRepository.appendEvents([
      buildLedgerEvent({
        organisationId: 'org-1',
        registrationId: 'reg-1',
        accreditationId: null,
        number: 1
      })
    ])

    const response = await server.inject({
      method: 'GET',
      url: makePath('org-1', 'reg-1'),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result).toHaveLength(1)
    expect(result[0].number).toBe(1)
    expect(result[0].accreditationId).toBeNull()
  })

  it('returns events ordered by number ascending', async () => {
    await ledgerRepository.appendEvents([
      buildLedgerEvent({
        organisationId: 'org-2',
        registrationId: 'reg-2',
        accreditationId: null,
        number: 1
      })
    ])
    await ledgerRepository.appendEvents([
      buildLedgerEvent({
        organisationId: 'org-2',
        registrationId: 'reg-2',
        accreditationId: null,
        number: 2
      })
    ])

    const response = await server.inject({
      method: 'GET',
      url: makePath('org-2', 'reg-2'),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result).toHaveLength(2)
    expect(result[0].number).toBe(1)
    expect(result[1].number).toBe(2)
  })

  it('returns an empty array when the registration holds no such events', async () => {
    const response = await server.inject({
      method: 'GET',
      url: makePath('org-none', 'reg-none'),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toEqual([])
  })

  it('does not return the events of an accreditation of the same registration', async () => {
    await ledgerRepository.appendEvents([
      buildLedgerEvent({
        organisationId: 'org-3',
        registrationId: 'reg-3',
        accreditationId: 'acc-3',
        number: 1
      })
    ])

    const response = await server.inject({
      method: 'GET',
      url: makePath('org-3', 'reg-3'),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toEqual([])
  })

  it('returns no events for a registration named under a different organisation', async () => {
    await ledgerRepository.appendEvents([
      buildLedgerEvent({
        organisationId: 'org-owner',
        registrationId: 'reg-owned',
        accreditationId: null,
        number: 1
      })
    ])

    const response = await server.inject({
      method: 'GET',
      url: makePath('org-stranger', 'reg-owned'),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toEqual([])
  })
})

testLedgerEventsAccess({
  makeUrl: (organisationId) => makePath(organisationId, 'reg-1')
})
