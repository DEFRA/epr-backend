import { describe, it, expect } from 'vitest'

import { createInMemorySummaryLogRowStateRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { buildStreamEvent } from '#waste-balances/repository/ledger-test-data.js'
import { buildSummaryLogRowStateEntry } from '#waste-records/repository/test-data.js'

import { summaryLogRowStatesForRegistration } from './read-summary-log-row-states.js'

/**
 * The reg-only summary-log submitted event migration closes the gap where
 * registered-only (null-accreditation) submissions wrote row states the read
 * model could not return. These tests pin the closure end-to-end and guard
 * against the event — a zero-delta balance event — surfacing a spurious balance.
 */

const registeredOnlyLedgerId = {
  organisationId: 'org-1',
  registrationId: 'reg-1',
  accreditationId: null
}
const createdBy = { id: 'system', name: 'backfill' }

const seedMembership = async (summaryLogRowStateRepository, summaryLogId) =>
  summaryLogRowStateRepository.upsertSummaryLogRowStates(
    registeredOnlyLedgerId,
    [buildSummaryLogRowStateEntry({ rowId: 'row-1', data: { tonnage: 10 } })],
    summaryLogId
  )

const emitRegOnlyEvent = (ledgerRepository, summaryLogId) =>
  createWasteBalanceService(ledgerRepository).submitSummaryLog(
    registeredOnlyLedgerId,
    { summaryLogId, creditTotal: 0 },
    createdBy
  )

describe('registered-only summary-log submitted event — read-through', () => {
  it('returns nothing for the registered-only ledger before an event exists (the gap)', async () => {
    const summaryLogRowStateRepository =
      createInMemorySummaryLogRowStateRepository()()
    await seedMembership(summaryLogRowStateRepository, 'log-1')

    const states = await summaryLogRowStatesForRegistration({
      ledgerRepository: createInMemoryLedgerRepository()(),
      summaryLogRowStateRepository,
      ...registeredOnlyLedgerId
    })

    expect(states).toEqual([])
  })

  it('returns the membership once the reg-only event is emitted (gap closed)', async () => {
    const summaryLogRowStateRepository =
      createInMemorySummaryLogRowStateRepository()()
    await seedMembership(summaryLogRowStateRepository, 'log-1')
    const ledgerRepository = createInMemoryLedgerRepository()()

    await emitRegOnlyEvent(ledgerRepository, 'log-1')

    const states = await summaryLogRowStatesForRegistration({
      ledgerRepository,
      summaryLogRowStateRepository,
      ...registeredOnlyLedgerId
    })

    expect(states.map((s) => s.rowId)).toEqual(['row-1'])
    expect(states[0].data).toEqual({ tonnage: 10 })
  })
})

describe('registered-only summary-log submitted event — balance neutrality', () => {
  it('leaves the registered-only ledger with a zero balance', async () => {
    const ledgerRepository = createInMemoryLedgerRepository()()

    await emitRegOnlyEvent(ledgerRepository, 'log-1')

    const balance = await createWasteBalanceService(
      ledgerRepository
    ).currentBalance(registeredOnlyLedgerId)
    expect(balance).toMatchObject({ amount: 0, availableAmount: 0 })
  })

  it('does not touch an accredited balance in the same registration', async () => {
    const ledgerRepository = createInMemoryLedgerRepository([
      buildStreamEvent({
        registrationId: 'reg-1',
        accreditationId: 'acc-1',
        number: 1,
        payload: { summaryLogId: 'log-acc', creditTotal: 50 },
        closingBalance: { amount: 50, availableAmount: 50 }
      })
    ])()

    await emitRegOnlyEvent(ledgerRepository, 'log-1')

    const accreditedBalance = await createWasteBalanceService(
      ledgerRepository
    ).currentBalance({
      registrationId: 'reg-1',
      accreditationId: 'acc-1',
      organisationId: 'org-1'
    })
    expect(accreditedBalance).toMatchObject({ amount: 50, availableAmount: 50 })
  })
})
