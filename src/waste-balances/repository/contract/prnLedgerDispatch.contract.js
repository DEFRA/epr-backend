import { describe, beforeEach, expect } from 'vitest'

import { WASTE_BALANCE_CANONICAL_SOURCE } from '../../domain/model.js'
import {
  LEDGER_PRN_OPERATION_TYPE,
  LEDGER_SOURCE_KIND,
  LEDGER_TRANSACTION_TYPE
} from '../ledger-schema.js'
import { buildLedgerTransaction } from '../ledger-test-data.js'
import { buildWasteBalance } from './test-data.js'

const seedLedgerWithOpeningBalance = async (
  ledgerRepository,
  { accreditationId, amount, availableAmount }
) => {
  await ledgerRepository.insertTransactions([
    buildLedgerTransaction({
      accreditationId,
      number: 1,
      type: LEDGER_TRANSACTION_TYPE.CREDIT,
      amount,
      openingBalance: { amount: 0, availableAmount: 0 },
      closingBalance: { amount, availableAmount }
    })
  ])
}

export const testPrnLedgerDispatchBehaviour = (it) => {
  describe('PRN write path dispatch — flag ON, canonicalSource=ledger', () => {
    let repository
    let ledgerRepository

    beforeEach(
      async ({
        ledgerEnabledWasteBalancesRepository,
        ledgerRepository: ledgerRepo,
        insertWasteBalance
      }) => {
        repository = await ledgerEnabledWasteBalancesRepository()
        ledgerRepository = ledgerRepo

        const wasteBalance = buildWasteBalance({
          accreditationId: 'acc-prn-ledger',
          organisationId: 'org-1',
          canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER,
          // Embedded amounts are stale on a 'ledger' marker. Set them to
          // obviously wrong values to prove the ledger is consulted instead.
          amount: -999,
          availableAmount: -999,
          transactions: []
        })

        await insertWasteBalance(wasteBalance)

        await seedLedgerWithOpeningBalance(ledgerRepository, {
          accreditationId: 'acc-prn-ledger',
          amount: 200,
          availableAmount: 200
        })
      }
    )

    it('PRN creation appends a debit on availableAmount only', async () => {
      await repository.deductAvailableBalanceForPrnCreation({
        accreditationId: 'acc-prn-ledger',
        organisationId: 'org-1',
        registrationId: 'reg-1',
        prnId: 'prn-create',
        tonnage: 50,
        user: { id: 'user-1', email: 'user-1@example.com' }
      })

      const latest =
        await ledgerRepository.findLatestByAccreditationId('acc-prn-ledger')
      expect(latest.number).toBe(2)
      expect(latest.type).toBe(LEDGER_TRANSACTION_TYPE.DEBIT)
      expect(latest.closingBalance).toEqual({
        amount: 200,
        availableAmount: 150
      })
      expect(latest.source).toEqual({
        kind: LEDGER_SOURCE_KIND.PRN_OPERATION,
        prnOperation: {
          prnId: 'prn-create',
          operationType: LEDGER_PRN_OPERATION_TYPE.CREATED
        }
      })
    })

    it('PRN issue appends a debit on amount only', async () => {
      await repository.deductTotalBalanceForPrnIssue({
        accreditationId: 'acc-prn-ledger',
        organisationId: 'org-1',
        registrationId: 'reg-1',
        prnId: 'prn-issue',
        tonnage: 30,
        user: { id: 'user-1', email: 'user-1@example.com' }
      })

      const latest =
        await ledgerRepository.findLatestByAccreditationId('acc-prn-ledger')
      expect(latest.type).toBe(LEDGER_TRANSACTION_TYPE.DEBIT)
      expect(latest.closingBalance).toEqual({
        amount: 170,
        availableAmount: 200
      })
      expect(latest.source.prnOperation.operationType).toBe(
        LEDGER_PRN_OPERATION_TYPE.ISSUED
      )
    })

    it('PRN cancellation appends a credit on availableAmount only', async () => {
      await repository.creditAvailableBalanceForPrnCancellation({
        accreditationId: 'acc-prn-ledger',
        organisationId: 'org-1',
        registrationId: 'reg-1',
        prnId: 'prn-cancel',
        tonnage: 20,
        user: { id: 'user-1', email: 'user-1@example.com' }
      })

      const latest =
        await ledgerRepository.findLatestByAccreditationId('acc-prn-ledger')
      expect(latest.type).toBe(LEDGER_TRANSACTION_TYPE.CREDIT)
      expect(latest.closingBalance).toEqual({
        amount: 200,
        availableAmount: 220
      })
      expect(latest.source.prnOperation.operationType).toBe(
        LEDGER_PRN_OPERATION_TYPE.CANCELLED
      )
    })

    it('issued-PRN cancellation appends a credit on both amount and availableAmount', async () => {
      await repository.creditFullBalanceForIssuedPrnCancellation({
        accreditationId: 'acc-prn-ledger',
        organisationId: 'org-1',
        registrationId: 'reg-1',
        prnId: 'prn-issued-cancel',
        tonnage: 10,
        user: { id: 'user-1', email: 'user-1@example.com' }
      })

      const latest =
        await ledgerRepository.findLatestByAccreditationId('acc-prn-ledger')
      expect(latest.type).toBe(LEDGER_TRANSACTION_TYPE.CREDIT)
      expect(latest.closingBalance).toEqual({
        amount: 210,
        availableAmount: 210
      })
      expect(latest.source.prnOperation.operationType).toBe(
        LEDGER_PRN_OPERATION_TYPE.ISSUED_CANCELLED
      )
    })

    it('a created → issued → issued-cancelled lifecycle ends back at the seed totals', async () => {
      const lifecycleParams = {
        accreditationId: 'acc-prn-ledger',
        organisationId: 'org-1',
        registrationId: 'reg-1',
        prnId: 'prn-lifecycle',
        tonnage: 40,
        user: { id: 'user-1', email: 'user-1@example.com' }
      }

      await repository.deductAvailableBalanceForPrnCreation(lifecycleParams)
      await repository.deductTotalBalanceForPrnIssue(lifecycleParams)
      await repository.creditFullBalanceForIssuedPrnCancellation(
        lifecycleParams
      )

      const latest =
        await ledgerRepository.findLatestByAccreditationId('acc-prn-ledger')
      expect(latest.number).toBe(4)
      expect(latest.closingBalance).toEqual({
        amount: 200,
        availableAmount: 200
      })
    })

    it('exposes ledger-derived totals via findByAccreditationId', async () => {
      await repository.deductAvailableBalanceForPrnCreation({
        accreditationId: 'acc-prn-ledger',
        organisationId: 'org-1',
        registrationId: 'reg-1',
        prnId: 'prn-create',
        tonnage: 75,
        user: { id: 'user-1', email: 'user-1@example.com' }
      })

      const balance = await repository.findByAccreditationId('acc-prn-ledger')
      expect(balance.amount).toBe(200)
      expect(balance.availableAmount).toBe(125)
    })
  })
}
