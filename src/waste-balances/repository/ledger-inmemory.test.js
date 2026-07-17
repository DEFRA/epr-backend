import { describe, it as base, expect, it } from 'vitest'

import { createInMemoryLedgerRepository } from './ledger-inmemory.js'
import { testLedgerRepositoryContract } from './ledger-port.contract.js'
import { buildLedgerEvent } from './ledger-test-data.js'

const extendedIt = base.extend({
  // eslint-disable-next-line no-empty-pattern
  ledgerStorage: async ({}, use) => {
    const storage = []
    await use(storage)
  },
  ledgerRepository: async (/** @type {*} */ { ledgerStorage }, use) => {
    const factory = createInMemoryLedgerRepository(ledgerStorage)
    await use(factory)
  }
})

describe('waste-balances ledger repository - in-memory implementation', () => {
  it('exposes the ledger port surface', () => {
    const repository = createInMemoryLedgerRepository()()
    expect(repository.appendEvents).toBeTypeOf('function')
    expect(repository.findLatestInLedger).toBeTypeOf('function')
    expect(repository.findLatestInLedgerByKind).toBeTypeOf('function')
    expect(repository.findEventsByPrnIdAfter).toBeTypeOf('function')
    expect(repository.findAllInLedger).toBeTypeOf('function')
    expect(repository.findLatestSubmittedSummaryLogPerLedger).toBeTypeOf(
      'function'
    )
  })

  testLedgerRepositoryContract(extendedIt)

  // The port has no way to seed events out of number order — appendEvents
  // enforces ascending, gap-free numbering. Only a directly-seeded in-memory
  // fixture can present a later-numbered submission ahead of an earlier one,
  // so this behaviour lives here rather than in the shared contract.
  describe('findLatestSubmittedSummaryLogPerLedger with out-of-order seeds', () => {
    it('returns the highest-numbered submission regardless of storage order', async () => {
      const partition = {
        organisationId: 'org-seed',
        registrationId: 'reg-seed',
        accreditationId: 'acc-seed'
      }
      const repository = createInMemoryLedgerRepository([
        {
          id: 'event-2',
          ...buildLedgerEvent({
            ...partition,
            number: 2,
            payload: { summaryLogId: 'log-2', creditTotal: 200 }
          })
        },
        {
          id: 'event-1',
          ...buildLedgerEvent({
            ...partition,
            number: 1,
            payload: { summaryLogId: 'log-1', creditTotal: 100 }
          })
        }
      ])()

      const result = await repository.findLatestSubmittedSummaryLogPerLedger()

      expect(result).toEqual([{ ledgerId: partition, summaryLogId: 'log-2' }])
    })
  })
})
