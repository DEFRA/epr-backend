import { describe, it, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'

import {
  buildLedgerEvent,
  buildPrnCreatedEvent
} from '#waste-balances/repository/ledger-test-data.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createMockIssuedPrn } from '#packaging-recycling-notes/routes/test-helpers.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import {
  testWasteBalanceLedgerAccess,
  testWasteBalanceLedgerResponseIsChecked
} from '../../waste-balance-ledger-test-helpers.js'
import {
  accreditationWasteBalanceLedgerGet,
  accreditationWasteBalanceLedgerGetPath
} from './get.js'

/**
 * @param {string} orgId
 * @param {string} regId
 * @param {string} accId
 */
const makePath = (orgId, regId, accId) =>
  accreditationWasteBalanceLedgerGetPath
    .replace('{organisationId}', orgId)
    .replace('{registrationId}', regId)
    .replace('{accreditationId}', accId)

describe(`GET ${accreditationWasteBalanceLedgerGetPath}`, () => {
  setupAuthContext()

  /** @type {import('#test/create-test-server.js').TestServer} */
  let server
  /** @type {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} */
  let ledgerRepository

  beforeEach(async () => {
    server = await createTestServer()
    ledgerRepository = server.app.ledgerRepository
  })

  describe('route metadata', () => {
    it('exposes the expected method and path', () => {
      expect(accreditationWasteBalanceLedgerGet.method).toBe('GET')
      expect(accreditationWasteBalanceLedgerGet.path).toBe(
        accreditationWasteBalanceLedgerGetPath
      )
      expect(accreditationWasteBalanceLedgerGetPath).toBe(
        '/v1/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/waste-balance-ledger'
      )
    })
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
      prn: { id: 'prn-1', prnNumber: null, tonnage: 50 }
    })
  })

  it('gives a PRN event the number its note is known by', async () => {
    const note = createMockIssuedPrn({
      id: 'prn-numbered',
      prnNumber: 'EA26000123',
      organisation: { id: 'org-note', name: 'A reprocessor' },
      registrationId: 'reg-note',
      accreditation: {
        ...createMockIssuedPrn().accreditation,
        id: 'acc-note'
      }
    })
    const serverHoldingTheNote = await createTestServer({
      repositories: {
        packagingRecyclingNotesRepository:
          createInMemoryPackagingRecyclingNotesRepository([note], [])
      }
    })
    await serverHoldingTheNote.app.ledgerRepository.appendEvents([
      buildPrnCreatedEvent({
        organisationId: 'org-note',
        registrationId: 'reg-note',
        accreditationId: 'acc-note',
        number: 1,
        payload: { prnId: 'prn-numbered', amount: 50 }
      })
    ])

    const response = await serverHoldingTheNote.inject({
      method: 'GET',
      url: makePath('org-note', 'reg-note', 'acc-note'),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload).events[0].prn).toEqual({
      id: 'prn-numbered',
      prnNumber: 'EA26000123',
      tonnage: 50
    })
  })

  it('gives no number for a note the accreditation does not hold', async () => {
    const noteOfAnotherAccreditation = createMockIssuedPrn({
      id: 'prn-elsewhere',
      prnNumber: 'EA26000456',
      organisation: { id: 'org-note', name: 'A reprocessor' },
      registrationId: 'reg-note',
      accreditation: {
        ...createMockIssuedPrn().accreditation,
        id: 'acc-elsewhere'
      }
    })
    const serverHoldingTheNote = await createTestServer({
      repositories: {
        packagingRecyclingNotesRepository:
          createInMemoryPackagingRecyclingNotesRepository(
            [noteOfAnotherAccreditation],
            []
          )
      }
    })
    await serverHoldingTheNote.app.ledgerRepository.appendEvents([
      buildPrnCreatedEvent({
        organisationId: 'org-note',
        registrationId: 'reg-note',
        accreditationId: 'acc-note',
        number: 1,
        payload: { prnId: 'prn-elsewhere', amount: 50 }
      })
    ])

    const response = await serverHoldingTheNote.inject({
      method: 'GET',
      url: makePath('org-note', 'reg-note', 'acc-note'),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload).events[0].prn).toEqual({
      id: 'prn-elsewhere',
      prnNumber: null,
      tonnage: 50
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

testWasteBalanceLedgerAccess({
  makeUrl: (organisationId) => makePath(organisationId, 'reg-1', 'acc-1')
})

testWasteBalanceLedgerResponseIsChecked({
  ledgerId: {
    organisationId: 'org-1',
    registrationId: 'reg-1',
    accreditationId: 'acc-1'
  },
  makeUrl: ({ organisationId, registrationId, accreditationId }) =>
    makePath(organisationId, registrationId, String(accreditationId))
})
