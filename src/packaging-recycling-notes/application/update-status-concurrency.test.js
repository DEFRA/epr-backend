import { describe, it, expect, vi } from 'vitest'

import {
  PRN_STATUS,
  PRN_ACTOR
} from '#packaging-recycling-notes/domain/model.js'
import { REGULATOR } from '#domain/organisations/model.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createInMemoryWasteBalancesRepository } from '#waste-balances/repository/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { buildAwaitingAuthorisationPrn } from '#packaging-recycling-notes/repository/contract/test-data.js'

vi.mock('./metrics.js', () => ({
  prnMetrics: {
    recordStatusTransition: vi.fn().mockResolvedValue(undefined)
  }
}))

const { updatePrnStatus } = await import('./update-status.js')

const noopLogger = () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
})

const PRN_ID = '507f1f77bcf86cd799439011'
const ORG_ID = 'org-123'
const ACC_ID = 'acc-456'

const buildIssuableSeed = () =>
  buildAwaitingAuthorisationPrn({
    id: PRN_ID,
    organisation: {
      id: ORG_ID,
      name: 'Test Reprocessor',
      tradingName: 'Trading Name'
    },
    accreditation: {
      id: ACC_ID,
      accreditationNumber: 'ACC-1',
      accreditationYear: 2026,
      material: 'plastic',
      submittedToRegulator: REGULATOR.EA,
      siteAddress: { line1: '1 Test Street', postcode: 'SW1A 1AA' }
    },
    tonnage: 50
  })

const buildBalanceSeed = () => ({
  id: 'wb-1',
  accreditationId: ACC_ID,
  organisationId: ORG_ID,
  amount: 1000,
  availableAmount: 1000,
  transactions: [],
  version: 0,
  schemaVersion: 1,
  canonicalSource: 'embedded'
})

const buildOrganisationsRepository = () => ({
  findAccreditationById: vi.fn().mockResolvedValue({
    submittedToRegulator: REGULATOR.EA
  })
})

describe('updatePrnStatus concurrency', () => {
  it('debits the waste balance only once when two issuances race for the same PRN', async () => {
    const prnFactory = createInMemoryPackagingRecyclingNotesRepository([
      buildIssuableSeed()
    ])
    const prnRepository = prnFactory(noopLogger())

    const wasteFactory = createInMemoryWasteBalancesRepository(
      [buildBalanceSeed()],
      { ledgerRepository: createInMemoryLedgerRepository()() }
    )
    const realWasteBalancesRepository = wasteFactory()
    const deductSpy = vi.fn(
      realWasteBalancesRepository.deductTotalBalanceForPrnIssue
    )
    const wasteBalancesRepository = {
      ...realWasteBalancesRepository,
      deductTotalBalanceForPrnIssue: deductSpy
    }

    const organisationsRepository = buildOrganisationsRepository()

    const issue = () =>
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository,
        id: PRN_ID,
        organisationId: ORG_ID,
        accreditationId: ACC_ID,
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        actor: PRN_ACTOR.SIGNATORY,
        user: { id: 'user-789', name: 'Test User' }
      })

    const results = await Promise.allSettled([issue(), issue()])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason).toMatchObject({
      isBoom: true,
      output: { statusCode: 409 }
    })
    expect(rejected[0].reason.message).toMatch(/Version conflict/)

    expect(deductSpy).toHaveBeenCalledTimes(1)
  })
})
