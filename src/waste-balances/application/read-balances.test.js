import { describe, it, expect } from 'vitest'

import { createInMemoryLedgerRepository } from '../repository/ledger-inmemory.js'
import {
  LEDGER_SOURCE_KIND,
  LEDGER_TRANSACTION_TYPE
} from '../repository/ledger-schema.js'
import {
  getCreditedAmountByWasteRecordId,
  getCurrentBalance,
  getOrganisationBalances,
  getRegistrationBalances
} from './read-balances.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

const buildTransaction = (overrides) => ({
  accreditationId: 'acc-1',
  organisationId: 'org-1',
  registrationId: 'reg-1',
  number: 1,
  type: LEDGER_TRANSACTION_TYPE.CREDIT,
  createdAt: new Date('2026-01-15T10:00:00.000Z'),
  createdBy: { id: 'user-1', name: 'Test User' },
  amount: 10,
  openingBalance: { amount: 0, availableAmount: 0 },
  closingBalance: { amount: 10, availableAmount: 10 },
  source: {
    kind: LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW,
    summaryLogRow: {
      summaryLogId: 'log-1',
      rowId: 'row-1',
      rowType: WASTE_RECORD_TYPE.RECEIVED,
      wasteRecordId: 'wr-1',
      wasteRecordVersionId: 'v-1'
    }
  },
  ...overrides
})

const repositoryWith = async (transactions) => {
  const factory = createInMemoryLedgerRepository()
  const repository = factory()
  if (transactions.length > 0) {
    await repository.insertTransactions(transactions)
  }
  return repository
}

describe('getCurrentBalance', () => {
  it('returns zero balance when the accreditation has no transactions', async () => {
    const repository = await repositoryWith([])
    const balance = await getCurrentBalance(repository, 'acc-empty')
    expect(balance).toEqual({ amount: 0, availableAmount: 0 })
  })

  it('returns the closing balance of the highest-numbered transaction', async () => {
    const repository = await repositoryWith([
      buildTransaction({
        number: 1,
        closingBalance: { amount: 10, availableAmount: 10 }
      }),
      buildTransaction({
        number: 2,
        closingBalance: { amount: 25, availableAmount: 22 },
        source: {
          kind: LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW,
          summaryLogRow: {
            summaryLogId: 'log-1',
            rowId: 'row-2',
            rowType: WASTE_RECORD_TYPE.RECEIVED,
            wasteRecordId: 'wr-2',
            wasteRecordVersionId: 'v-2'
          }
        }
      })
    ])

    const balance = await getCurrentBalance(repository, 'acc-1')
    expect(balance).toEqual({ amount: 25, availableAmount: 22 })
  })
})

describe('getCreditedAmountByWasteRecordId', () => {
  it('returns 0 when the waste record has no transactions', async () => {
    const repository = await repositoryWith([])
    const credited = await getCreditedAmountByWasteRecordId(
      repository,
      'wr-missing'
    )
    expect(credited).toBe(0)
  })

  it('returns the signed sum across credits and debits', async () => {
    const repository = await repositoryWith([
      buildTransaction({
        number: 1,
        type: LEDGER_TRANSACTION_TYPE.CREDIT,
        amount: 100
      }),
      buildTransaction({
        number: 2,
        type: LEDGER_TRANSACTION_TYPE.DEBIT,
        amount: 30,
        source: {
          kind: LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW,
          summaryLogRow: {
            summaryLogId: 'log-1',
            rowId: 'row-1',
            rowType: WASTE_RECORD_TYPE.RECEIVED,
            wasteRecordId: 'wr-1',
            wasteRecordVersionId: 'v-2'
          }
        }
      })
    ])

    const credited = await getCreditedAmountByWasteRecordId(repository, 'wr-1')
    expect(credited).toBe(70)
  })

  it('returns 0 when the bulk primitive omits the requested id', async () => {
    // Defensive: a malformed adapter response shouldn't crash the caller.
    const repository = {
      findCreditedAmountsByWasteRecordIds: async () => new Map()
    }
    const credited = await getCreditedAmountByWasteRecordId(repository, 'wr-X')
    expect(credited).toBe(0)
  })

  it('handles the multi-upload delta case (+100, -30, re-upload of 70 → 70)', async () => {
    // Initial upload credits 100, second upload debits 30 (target dropped to 70),
    // third upload re-applies same target — delta is 0, so no third transaction.
    // Expected sum: 70.
    const repository = await repositoryWith([
      buildTransaction({
        number: 1,
        type: LEDGER_TRANSACTION_TYPE.CREDIT,
        amount: 100
      }),
      buildTransaction({
        number: 2,
        type: LEDGER_TRANSACTION_TYPE.DEBIT,
        amount: 30,
        source: {
          kind: LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW,
          summaryLogRow: {
            summaryLogId: 'log-1',
            rowId: 'row-1',
            rowType: WASTE_RECORD_TYPE.RECEIVED,
            wasteRecordId: 'wr-1',
            wasteRecordVersionId: 'v-2'
          }
        }
      })
    ])

    const credited = await getCreditedAmountByWasteRecordId(repository, 'wr-1')
    expect(credited).toBe(70)
  })
})

describe('getOrganisationBalances', () => {
  it('returns an empty array when the organisation has no transactions', async () => {
    const repository = await repositoryWith([])
    const balances = await getOrganisationBalances(repository, 'org-empty')
    expect(balances).toEqual([])
  })

  it('returns latest balance per accreditation under the organisation', async () => {
    const repository = await repositoryWith([
      buildTransaction({
        organisationId: 'org-X',
        accreditationId: 'acc-A',
        number: 1,
        closingBalance: { amount: 10, availableAmount: 10 }
      }),
      buildTransaction({
        organisationId: 'org-X',
        accreditationId: 'acc-A',
        number: 2,
        closingBalance: { amount: 30, availableAmount: 28 },
        source: {
          kind: LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW,
          summaryLogRow: {
            summaryLogId: 'log-1',
            rowId: 'row-2',
            rowType: WASTE_RECORD_TYPE.RECEIVED,
            wasteRecordId: 'wr-2',
            wasteRecordVersionId: 'v-1'
          }
        }
      }),
      buildTransaction({
        organisationId: 'org-X',
        accreditationId: 'acc-B',
        number: 1,
        closingBalance: { amount: 100, availableAmount: 100 },
        source: {
          kind: LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW,
          summaryLogRow: {
            summaryLogId: 'log-2',
            rowId: 'row-1',
            rowType: WASTE_RECORD_TYPE.RECEIVED,
            wasteRecordId: 'wr-3',
            wasteRecordVersionId: 'v-1'
          }
        }
      })
    ])

    const balances = await getOrganisationBalances(repository, 'org-X')
    const sorted = balances.sort((a, b) =>
      a.accreditationId.localeCompare(b.accreditationId)
    )

    expect(sorted).toEqual([
      { accreditationId: 'acc-A', amount: 30, availableAmount: 28 },
      { accreditationId: 'acc-B', amount: 100, availableAmount: 100 }
    ])
  })
})

describe('getRegistrationBalances', () => {
  it('returns an empty array when the registration has no transactions', async () => {
    const repository = await repositoryWith([])
    const balances = await getRegistrationBalances(repository, 'reg-empty')
    expect(balances).toEqual([])
  })

  it('returns latest balance per accreditation under the registration', async () => {
    const repository = await repositoryWith([
      buildTransaction({
        registrationId: 'reg-X',
        accreditationId: 'acc-A',
        number: 1,
        closingBalance: { amount: 10, availableAmount: 10 }
      }),
      buildTransaction({
        registrationId: 'reg-X',
        accreditationId: 'acc-A',
        number: 2,
        closingBalance: { amount: 30, availableAmount: 28 },
        source: {
          kind: LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW,
          summaryLogRow: {
            summaryLogId: 'log-1',
            rowId: 'row-2',
            rowType: WASTE_RECORD_TYPE.RECEIVED,
            wasteRecordId: 'wr-2',
            wasteRecordVersionId: 'v-1'
          }
        }
      })
    ])

    const balances = await getRegistrationBalances(repository, 'reg-X')
    expect(balances).toEqual([
      { accreditationId: 'acc-A', amount: 30, availableAmount: 28 }
    ])
  })
})
