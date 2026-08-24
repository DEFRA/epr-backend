import { describe, it, expect, beforeEach } from 'vitest'

import { createInMemoryLedgerRepository } from '../repository/ledger-inmemory.js'
import {
  buildLedgerEvent,
  buildLedgerId,
  buildPrnAcceptedEvent
} from '../repository/ledger-test-data.js'
import { createLedgerView } from './ledger-view.js'

describe('waste balance ledger view', () => {
  /** @type {import('../repository/ledger-port.js').WasteBalanceLedgerRepository} */
  let ledgerRepository

  /** @type {import('./ledger-view.js').LedgerView} */
  let view

  beforeEach(() => {
    ledgerRepository = createInMemoryLedgerRepository()()
    view = createLedgerView({ ledgerRepository })
  })

  it('names the ledger the events belong to', async () => {
    const result = await view.read(buildLedgerId())

    expect(result.ledger).toEqual({
      organisationId: 'org-1',
      registrationId: 'reg-1',
      accreditationId: 'acc-1'
    })
  })

  it('names a registered-only ledger by its null accreditation', async () => {
    const ledgerId = buildLedgerId({ accreditationId: null })

    const result = await view.read(ledgerId)

    expect(result.ledger.accreditationId).toBeNull()
  })

  it('returns no events for a ledger that holds none', async () => {
    const result = await view.read(buildLedgerId())

    expect(result.events).toEqual([])
  })

  it('gives each event one balance holding its opening and closing totals', async () => {
    await ledgerRepository.appendEvents([
      buildLedgerEvent({
        openingBalance: { amount: 10, availableAmount: 8 },
        closingBalance: { amount: 30, availableAmount: 28 }
      })
    ])

    const [event] = (await view.read(buildLedgerId())).events

    expect(event.balance).toEqual({
      opening: { total: 10, available: 8 },
      closing: { total: 30, available: 28 }
    })
  })

  it('names the summary log a submission event credits', async () => {
    await ledgerRepository.appendEvents([
      buildLedgerEvent({ payload: { summaryLogId: 'log-7', creditTotal: 250 } })
    ])

    const [event] = (await view.read(buildLedgerId())).events

    expect(event.summaryLog).toEqual({ id: 'log-7', creditTotal: 250 })
    expect(event.prn).toBeUndefined()
  })

  it('names the note a PRN event concerns, and its tonnage', async () => {
    await ledgerRepository.appendEvents([
      buildPrnAcceptedEvent({ payload: { prnId: 'prn-9', amount: 40 } })
    ])

    const [event] = (await view.read(buildLedgerId())).events

    expect(event.prn).toEqual({ id: 'prn-9', tonnage: 40 })
    expect(event.summaryLog).toBeUndefined()
  })

  it('carries an actor the source knows only the id of', async () => {
    await ledgerRepository.appendEvents([
      buildLedgerEvent({ createdBy: { id: 'user-9' } })
    ])

    const [event] = (await view.read(buildLedgerId())).events

    expect(event.createdBy).toEqual({ id: 'user-9' })
  })

  it('carries an actor name and email where the source holds them', async () => {
    await ledgerRepository.appendEvents([
      buildLedgerEvent({
        createdBy: { id: 'user-9', name: 'Jo Sample', email: 'jo@example.com' }
      })
    ])

    const [event] = (await view.read(buildLedgerId())).events

    expect(event.createdBy).toEqual({
      id: 'user-9',
      name: 'Jo Sample',
      email: 'jo@example.com'
    })
  })

  it('repeats none of the ledger ids on an event, and hands out no storage id', async () => {
    await ledgerRepository.appendEvents([buildLedgerEvent()])

    const [event] = (await view.read(buildLedgerId())).events

    expect(Object.keys(event).sort()).toEqual([
      'balance',
      'createdAt',
      'createdBy',
      'kind',
      'number',
      'summaryLog'
    ])
  })

  it('reads the events of the ledger it names in order', async () => {
    await ledgerRepository.appendEvents([buildLedgerEvent({ number: 1 })])
    await ledgerRepository.appendEvents([buildLedgerEvent({ number: 2 })])
    await ledgerRepository.appendEvents([
      buildLedgerEvent({ accreditationId: null, number: 1 })
    ])

    const result = await view.read(buildLedgerId())

    expect(result.events.map((event) => event.number)).toEqual([1, 2])
  })
})
