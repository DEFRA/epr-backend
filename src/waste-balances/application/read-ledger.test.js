import { describe, it, expect, beforeEach, vi } from 'vitest'

import { createInMemoryLedgerRepository } from '../repository/ledger-inmemory.js'
import {
  buildLedgerEvent,
  buildLedgerId,
  buildPrnAcceptedEvent
} from '../repository/ledger-test-data.js'
import { readLedger } from './read-ledger.js'

/**
 * @param {Array<{ id: string, prnNumber?: string | null }>} notes
 */
const noteReaderHolding = (notes) => ({
  findByAccreditation: vi.fn(async () => notes)
})

describe('reading a waste balance ledger', () => {
  /** @type {import('../repository/ledger-port.js').WasteBalanceLedgerRepository} */
  let ledgerRepository
  /** @type {ReturnType<typeof noteReaderHolding>} */
  let noteReader

  beforeEach(() => {
    ledgerRepository = createInMemoryLedgerRepository()()
    noteReader = noteReaderHolding([])
  })

  it('names the ledger the events belong to', async () => {
    const result = await readLedger(
      ledgerRepository,
      noteReader,
      buildLedgerId()
    )

    expect(result.ledger).toEqual({
      organisationId: 'org-1',
      registrationId: 'reg-1',
      accreditationId: 'acc-1'
    })
  })

  it('names a registered-only ledger by its null accreditation', async () => {
    const ledgerId = buildLedgerId({ accreditationId: null })

    const result = await readLedger(ledgerRepository, noteReader, ledgerId)

    expect(result.ledger.accreditationId).toBeNull()
  })

  it('returns no events for a ledger that holds none', async () => {
    const result = await readLedger(
      ledgerRepository,
      noteReader,
      buildLedgerId()
    )

    expect(result.events).toEqual([])
  })

  it('gives each event one balance holding its opening and closing totals', async () => {
    await ledgerRepository.appendEvents([
      buildLedgerEvent({
        openingBalance: { amount: 10, availableAmount: 8 },
        closingBalance: { amount: 30, availableAmount: 28 }
      })
    ])

    const result = await readLedger(
      ledgerRepository,
      noteReader,
      buildLedgerId()
    )

    expect(result.events).toEqual([
      expect.objectContaining({
        balance: {
          opening: { total: 10, available: 8 },
          closing: { total: 30, available: 28 }
        }
      })
    ])
  })

  it('names the summary log a submission event credits', async () => {
    await ledgerRepository.appendEvents([
      buildLedgerEvent({ payload: { summaryLogId: 'log-7', creditTotal: 250 } })
    ])

    const result = await readLedger(
      ledgerRepository,
      noteReader,
      buildLedgerId()
    )

    expect(result.events).toEqual([
      expect.objectContaining({ summaryLog: { id: 'log-7', creditTotal: 250 } })
    ])
  })

  it('names the note a PRN event concerns, and its tonnage', async () => {
    await ledgerRepository.appendEvents([
      buildPrnAcceptedEvent({ payload: { prnId: 'prn-9', amount: 40 } })
    ])
    noteReader = noteReaderHolding([{ id: 'prn-9', prnNumber: 'EX123456789' }])

    const result = await readLedger(
      ledgerRepository,
      noteReader,
      buildLedgerId()
    )

    expect(result.events).toEqual([
      expect.objectContaining({
        prn: { id: 'prn-9', prnNumber: 'EX123456789', tonnage: 40 }
      })
    ])
  })

  it('gives a PRN event no number while the note it names holds none', async () => {
    await ledgerRepository.appendEvents([
      buildPrnAcceptedEvent({ payload: { prnId: 'prn-9', amount: 40 } })
    ])
    noteReader = noteReaderHolding([{ id: 'prn-9' }])

    const result = await readLedger(
      ledgerRepository,
      noteReader,
      buildLedgerId()
    )

    expect(result.events).toEqual([
      expect.objectContaining({
        prn: { id: 'prn-9', prnNumber: null, tonnage: 40 }
      })
    ])
  })

  it('gives a PRN event no number when the note reader no longer holds the note', async () => {
    await ledgerRepository.appendEvents([
      buildPrnAcceptedEvent({ payload: { prnId: 'prn-9', amount: 40 } })
    ])
    noteReader = noteReaderHolding([{ id: 'a-different-note' }])

    const result = await readLedger(
      ledgerRepository,
      noteReader,
      buildLedgerId()
    )

    expect(result.events).toEqual([
      expect.objectContaining({
        prn: { id: 'prn-9', prnNumber: null, tonnage: 40 }
      })
    ])
  })

  it('reads no note for a ledger whose events name none', async () => {
    await ledgerRepository.appendEvents([buildLedgerEvent()])

    await readLedger(ledgerRepository, noteReader, buildLedgerId())

    expect(noteReader.findByAccreditation).not.toHaveBeenCalled()
  })

  it('reads no note for a registered-only ledger', async () => {
    const ledgerId = buildLedgerId({ accreditationId: null })
    await ledgerRepository.appendEvents([
      buildLedgerEvent({ accreditationId: null })
    ])

    await readLedger(ledgerRepository, noteReader, ledgerId)

    expect(noteReader.findByAccreditation).not.toHaveBeenCalled()
  })

  it('reads the notes of the accreditation whose ledger it is reading', async () => {
    await ledgerRepository.appendEvents([buildPrnAcceptedEvent()])

    await readLedger(ledgerRepository, noteReader, buildLedgerId())

    expect(noteReader.findByAccreditation).toHaveBeenCalledWith({
      organisationId: 'org-1',
      registrationId: 'reg-1',
      accreditationId: 'acc-1'
    })
  })

  it('carries an actor the source knows only the id of', async () => {
    await ledgerRepository.appendEvents([
      buildLedgerEvent({ createdBy: { id: 'user-9' } })
    ])

    const result = await readLedger(
      ledgerRepository,
      noteReader,
      buildLedgerId()
    )

    expect(result.events).toEqual([
      expect.objectContaining({ createdBy: { id: 'user-9' } })
    ])
  })

  it('carries an actor name and email where the source holds them', async () => {
    await ledgerRepository.appendEvents([
      buildLedgerEvent({
        createdBy: { id: 'user-9', name: 'Jo Sample', email: 'jo@example.com' }
      })
    ])

    const result = await readLedger(
      ledgerRepository,
      noteReader,
      buildLedgerId()
    )

    expect(result.events).toEqual([
      expect.objectContaining({
        createdBy: {
          id: 'user-9',
          name: 'Jo Sample',
          email: 'jo@example.com'
        }
      })
    ])
  })

  it('addresses an event by its number and repeats no ledger id on it', async () => {
    await ledgerRepository.appendEvents([buildLedgerEvent()])

    const result = await readLedger(
      ledgerRepository,
      noteReader,
      buildLedgerId()
    )

    expect(result.events.map((event) => Object.keys(event).sort())).toEqual([
      ['balance', 'createdAt', 'createdBy', 'kind', 'number', 'summaryLog']
    ])
  })

  it('reads the events of the ledger it names in order', async () => {
    await ledgerRepository.appendEvents([buildLedgerEvent({ number: 1 })])
    await ledgerRepository.appendEvents([buildLedgerEvent({ number: 2 })])
    await ledgerRepository.appendEvents([
      buildLedgerEvent({ accreditationId: null, number: 1 })
    ])

    const result = await readLedger(
      ledgerRepository,
      noteReader,
      buildLedgerId()
    )

    expect(result.events.map((event) => event.number)).toEqual([1, 2])
  })
})
