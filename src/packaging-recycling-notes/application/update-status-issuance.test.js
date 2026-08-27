import { describe, it, expect, vi } from 'vitest'

import {
  PRN_STATUS,
  PRN_ACTOR
} from '#packaging-recycling-notes/domain/model.js'
import { ACCREDITATION_STATUS, REGULATOR } from '#domain/organisations/model.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'
import { buildAwaitingAuthorisationPrn } from '#packaging-recycling-notes/repository/contract/test-data.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { readLedger } from '#waste-balances/application/read-ledger.js'

vi.mock('./metrics.js', () => ({
  prnMetrics: {
    recordStatusTransition: vi.fn().mockResolvedValue(undefined)
  }
}))

const { updatePrnStatus: updatePrnStatusUntyped } =
  await import('./update-status.js')
const updatePrnStatus =
  /** @type {typeof import('./update-status.js').updatePrnStatus} */ (
    updatePrnStatusUntyped
  )

const PRN_ID = '507f1f77bcf86cd799439011'
const ORG_ID = 'org-123'
const REG_ID = 'reg-789'
const ACC_ID = 'acc-456'
const TONNAGE = 50
const STARTING_TOTAL = 1000
const LEDGER_ID = {
  organisationId: ORG_ID,
  registrationId: REG_ID,
  accreditationId: ACC_ID
}

const noopLogger = () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn()
})

const buildIssuableSeed = () =>
  /** @type {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} */ (
    buildAwaitingAuthorisationPrn({
      id: PRN_ID,
      registrationId: REG_ID,
      organisation: { id: ORG_ID, name: 'Test Reprocessor' },
      accreditation: {
        id: ACC_ID,
        accreditationNumber: 'ACC-1',
        accreditationYear: 2026,
        material: 'plastic',
        submittedToRegulator: REGULATOR.EA
      },
      tonnage: TONNAGE
    })
  )

const buildOrganisationsRepository = () =>
  /** @type {import('#repositories/organisations/port.js').OrganisationsRepository} */ (
    /** @type {unknown} */ ({
      findAccreditationById: vi.fn().mockResolvedValue({
        status: ACCREDITATION_STATUS.APPROVED,
        submittedToRegulator: REGULATOR.EA
      })
    })
  )

/**
 * Seed the stream so the ledger resolves to a balance on read.
 *
 * @param {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} ledgerRepository
 */
const seedClosingBalance = (ledgerRepository) =>
  ledgerRepository.appendEvents([
    buildLedgerEvent({
      ...LEDGER_ID,
      number: 1,
      closingBalance: {
        amount: STARTING_TOTAL,
        availableAmount: STARTING_TOTAL
      }
    })
  ])

/**
 * A ledger that is read the instant an event lands on it, exactly as a
 * regulator's read would land between the write's two steps.
 *
 * @param {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} ledgerRepository
 * @param {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} prnRepository
 */
const withLedgerReadAsEachEventLands = (ledgerRepository, prnRepository) => {
  /** @type {import('#waste-balances/application/read-ledger.js').LedgerResource[]} */
  const reads = []

  return {
    reads,
    ledgerRepository: {
      ...ledgerRepository,
      appendEvents: async (
        /** @type {Parameters<typeof ledgerRepository.appendEvents>[0]} */ events
      ) => {
        const appended = await ledgerRepository.appendEvents(events)
        reads.push(await readLedger(ledgerRepository, prnRepository, LEDGER_ID))
        return appended
      }
    }
  }
}

describe('issuing a PRN', () => {
  it('states the note number on the issuance event to a read that lands the instant it commits', async () => {
    const prnRepository = createInMemoryPackagingRecyclingNotesRepository([
      buildIssuableSeed()
    ])(noopLogger())
    const seededLedger = createInMemoryLedgerRepository()()
    await seedClosingBalance(seededLedger)
    const { ledgerRepository, reads } = withLedgerReadAsEachEventLands(
      seededLedger,
      prnRepository
    )

    const issued = await updatePrnStatus({
      prnRepository,
      ledgerRepository,
      organisationsRepository: buildOrganisationsRepository(),
      prnEvents: { onCancelled: vi.fn().mockResolvedValue(undefined) },
      logger: noopLogger(),
      id: PRN_ID,
      ...LEDGER_ID,
      newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
      actor: PRN_ACTOR.SIGNATORY,
      user: { id: 'user-789', name: 'Test User' }
    })

    const issuanceEvent = reads
      .flatMap((read) => read.events)
      .find((event) => event.kind === LEDGER_EVENT_KIND.PRN_ISSUED)

    expect(issued.prnNumber).toEqual(expect.any(String))
    expect(issuanceEvent?.prn?.prnNumber).toBe(issued.prnNumber)
  })
})
