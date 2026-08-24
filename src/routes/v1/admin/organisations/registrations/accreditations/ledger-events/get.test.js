import { describe, it, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'

import {
  buildLedgerEvent,
  buildPrnCreatedEvent
} from '#waste-balances/repository/ledger-test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { testLedgerEventsAccess } from '../../ledger-events-test-helpers.js'
import { accreditationLedgerEventsGetPath } from './get.js'

/**
 * @param {string} orgId
 * @param {string} regId
 * @param {string} accId
 */
const makePath = (orgId, regId, accId) =>
  accreditationLedgerEventsGetPath
    .replace('{organisationId}', orgId)
    .replace('{registrationId}', regId)
    .replace('{accreditationId}', accId)

describe(`GET ${accreditationLedgerEventsGetPath}`, () => {
  setupAuthContext()

  /** @type {import('#test/create-test-server.js').TestServer} */
  let server
  /** @type {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} */
  let ledgerRepository

  beforeEach(async () => {
    server = await createTestServer()
    ledgerRepository = server.app.ledgerRepository
  })

  it('returns 200 with events for the ledger', async () => {
    await ledgerRepository.appendEvents([
      buildLedgerEvent({
        registrationId: 'reg-1',
        accreditationId: 'acc-1',
        organisationId: 'org-1',
        number: 1
      })
    ])

    const response = await server.inject({
      method: 'GET',
      url: makePath('org-1', 'reg-1', 'acc-1'),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result.ledger).toEqual({
      organisationId: 'org-1',
      registrationId: 'reg-1',
      accreditationId: 'acc-1'
    })
    expect(result.events).toHaveLength(1)
    expect(result.events[0].number).toBe(1)
  })

  it('gives a PRN event the note it concerns and the note’s tonnage', async () => {
    await ledgerRepository.appendEvents([
      buildPrnCreatedEvent({
        registrationId: 'reg-prn',
        accreditationId: 'acc-prn',
        organisationId: 'org-prn',
        number: 1,
        payload: { prnId: 'prn-1', amount: 50 },
        openingBalance: { amount: 100, availableAmount: 100 },
        closingBalance: { amount: 100, availableAmount: 50 }
      })
    ])

    const response = await server.inject({
      method: 'GET',
      url: makePath('org-prn', 'reg-prn', 'acc-prn'),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload).events[0]).toEqual({
      number: 1,
      kind: 'prn-created',
      createdAt: '2026-01-15T10:00:00.000Z',
      createdBy: { id: 'user-1', name: 'Test User' },
      balance: {
        opening: { total: 100, available: 100 },
        closing: { total: 100, available: 50 }
      },
      prn: { id: 'prn-1', tonnage: 50 }
    })
  })

  it('returns events ordered by number ascending', async () => {
    await ledgerRepository.appendEvents([
      buildLedgerEvent({
        registrationId: 'reg-2',
        accreditationId: 'acc-2',
        organisationId: 'org-2',
        number: 1
      })
    ])
    await ledgerRepository.appendEvents([
      buildLedgerEvent({
        registrationId: 'reg-2',
        accreditationId: 'acc-2',
        organisationId: 'org-2',
        number: 2
      })
    ])

    const response = await server.inject({
      method: 'GET',
      url: makePath('org-2', 'reg-2', 'acc-2'),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    /** @type {{ events: Array<{ number: number }> }} */
    const result = JSON.parse(response.payload)
    expect(result.events.map((event) => event.number)).toEqual([1, 2])
  })

  it('returns no events when the accreditation holds none', async () => {
    const response = await server.inject({
      method: 'GET',
      url: makePath('org-none', 'reg-none', 'acc-none'),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload).events).toEqual([])
  })

  it('returns no events for a registration named under a different organisation', async () => {
    await ledgerRepository.appendEvents([
      buildLedgerEvent({
        organisationId: 'org-owner',
        registrationId: 'reg-owned',
        accreditationId: 'acc-owned',
        number: 1
      })
    ])

    const response = await server.inject({
      method: 'GET',
      url: makePath('org-stranger', 'reg-owned', 'acc-owned'),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload).events).toEqual([])
  })
})

testLedgerEventsAccess({
  makeUrl: (organisationId) => makePath(organisationId, 'reg-1', 'acc-1')
})
