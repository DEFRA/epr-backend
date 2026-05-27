import { describe, it, expect, vi } from 'vitest'

import { applyWasteBalanceEffects } from './update-status-balance-effects.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { createInMemoryWasteBalancesRepository } from '#waste-balances/repository/inmemory.js'
import { createInMemoryStreamRepository } from '#waste-balances/repository/stream-inmemory.js'
import { WASTE_BALANCE_CANONICAL_SOURCE } from '#waste-balances/domain/model.js'
import { buildStreamEvent } from '#waste-balances/repository/stream-test-data.js'

const REGISTRATION_ID = 'reg-1'
const ACCREDITATION_ID = 'acc-1'
const ORGANISATION_ID = 'org-1'
const SEEDED_EVENT_NUMBER = 1
const APPENDED_EVENT_NUMBER = 2

const buildLogger = () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn()
})

/**
 * A ledger-backed in-memory repository seeded with one stream event so the
 * marker-aware read resolves a non-zero balance. The next balance effect
 * appends a second event, so the returned watermark is APPENDED_EVENT_NUMBER.
 */
const setupLedgerRepository = async () => {
  const streamRepository = createInMemoryStreamRepository()()
  await streamRepository.appendEvent(
    buildStreamEvent({
      registrationId: REGISTRATION_ID,
      accreditationId: ACCREDITATION_ID,
      number: SEEDED_EVENT_NUMBER,
      closingBalance: { amount: 100, availableAmount: 100 }
    })
  )

  const ledgerBalance = {
    id: 'bal-1',
    organisationId: ORGANISATION_ID,
    registrationId: REGISTRATION_ID,
    accreditationId: ACCREDITATION_ID,
    schemaVersion: 1,
    version: 1,
    amount: 0,
    availableAmount: 0,
    canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER,
    transactions: []
  }

  const wasteBalancesRepository = createInMemoryWasteBalancesRepository(
    [ledgerBalance],
    { streamRepository }
  )()

  return { wasteBalancesRepository, streamRepository }
}

const balanceParamsFor = (overrides) => ({
  prnId: 'prn-1',
  tonnage: 10,
  accreditationId: ACCREDITATION_ID,
  registrationId: REGISTRATION_ID,
  organisationId: ORGANISATION_ID,
  userId: 'user-1',
  ...overrides
})

describe('applyWasteBalanceEffects watermark return', () => {
  it('returns the appended event number from the deduct-available branch', async () => {
    const { wasteBalancesRepository, streamRepository } =
      await setupLedgerRepository()

    const watermark = await applyWasteBalanceEffects(
      wasteBalancesRepository,
      buildLogger(),
      balanceParamsFor({
        currentStatus: PRN_STATUS.DRAFT,
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION
      })
    )

    const latest = await streamRepository.findLatestByPartition(
      REGISTRATION_ID,
      ACCREDITATION_ID
    )
    expect(watermark).toBe(latest?.number)
    expect(watermark).toBe(APPENDED_EVENT_NUMBER)
  })

  it('returns the appended event number from the deduct-total branch', async () => {
    const { wasteBalancesRepository, streamRepository } =
      await setupLedgerRepository()

    const watermark = await applyWasteBalanceEffects(
      wasteBalancesRepository,
      buildLogger(),
      balanceParamsFor({
        currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE
      })
    )

    const latest = await streamRepository.findLatestByPartition(
      REGISTRATION_ID,
      ACCREDITATION_ID
    )
    expect(watermark).toBe(latest?.number)
    expect(watermark).toBe(APPENDED_EVENT_NUMBER)
  })

  it('returns the appended event number from the credit-available branch', async () => {
    const { wasteBalancesRepository, streamRepository } =
      await setupLedgerRepository()

    const watermark = await applyWasteBalanceEffects(
      wasteBalancesRepository,
      buildLogger(),
      balanceParamsFor({
        currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        newStatus: PRN_STATUS.DELETED
      })
    )

    const latest = await streamRepository.findLatestByPartition(
      REGISTRATION_ID,
      ACCREDITATION_ID
    )
    expect(watermark).toBe(latest?.number)
    expect(watermark).toBe(APPENDED_EVENT_NUMBER)
  })

  it('returns the appended event number from the credit-full branch', async () => {
    const { wasteBalancesRepository, streamRepository } =
      await setupLedgerRepository()

    const watermark = await applyWasteBalanceEffects(
      wasteBalancesRepository,
      buildLogger(),
      balanceParamsFor({
        currentStatus: PRN_STATUS.AWAITING_CANCELLATION,
        newStatus: PRN_STATUS.CANCELLED
      })
    )

    const latest = await streamRepository.findLatestByPartition(
      REGISTRATION_ID,
      ACCREDITATION_ID
    )
    expect(watermark).toBe(latest?.number)
    expect(watermark).toBe(APPENDED_EVENT_NUMBER)
  })

  it('returns null when the transition has no balance effect', async () => {
    const { wasteBalancesRepository } = await setupLedgerRepository()

    const watermark = await applyWasteBalanceEffects(
      wasteBalancesRepository,
      buildLogger(),
      balanceParamsFor({
        currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        newStatus: PRN_STATUS.AWAITING_CANCELLATION
      })
    )

    expect(watermark).toBeNull()
  })
})
