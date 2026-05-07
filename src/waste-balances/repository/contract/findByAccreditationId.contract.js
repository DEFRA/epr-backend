import { describe, beforeEach, expect } from 'vitest'
import { WASTE_BALANCE_CANONICAL_SOURCE } from '../../domain/model.js'
import { buildWasteBalance } from './test-data.js'
import { buildLedgerTransaction } from '../ledger-test-data.js'

export const testFindByAccreditationIdBehaviour = (it) => {
  describe('findByAccreditationId', () => {
    let repository

    beforeEach(async ({ wasteBalancesRepository }) => {
      repository = await wasteBalancesRepository()
    })

    it('returns null when no waste balance exists for the accreditation', async () => {
      const result = await repository.findByAccreditationId('acc-nonexistent')

      expect(result).toBeNull()
    })

    it('returns waste balance when it exists for the accreditation', async ({
      insertWasteBalance
    }) => {
      const wasteBalance = buildWasteBalance({
        accreditationId: 'acc-123',
        organisationId: 'org-1',
        amount: 250,
        availableAmount: 200
      })

      await insertWasteBalance(wasteBalance)

      const result = await repository.findByAccreditationId('acc-123')

      expect(result).not.toBeNull()
      expect(result.accreditationId).toBe('acc-123')
      expect(result.organisationId).toBe('org-1')
      expect(result.amount).toBe(250)
      expect(result.availableAmount).toBe(200)
      expect(result.transactions).toBeDefined()
      expect(result.transactions).toHaveLength(1)
    })

    it('returns correct waste balance when multiple balances exist', async ({
      insertWasteBalances
    }) => {
      const balance1 = buildWasteBalance({
        accreditationId: 'acc-1',
        amount: 100
      })
      const balance2 = buildWasteBalance({
        accreditationId: 'acc-2',
        amount: 200
      })
      const balance3 = buildWasteBalance({
        accreditationId: 'acc-3',
        amount: 300
      })

      await insertWasteBalances([balance1, balance2, balance3])

      const result = await repository.findByAccreditationId('acc-2')

      expect(result).not.toBeNull()
      expect(result.accreditationId).toBe('acc-2')
      expect(result.amount).toBe(200)
    })

    it('throws error when accreditationId is null', async () => {
      await expect(repository.findByAccreditationId(null)).rejects.toThrow()
    })

    it('throws error when accreditationId is undefined', async () => {
      await expect(
        repository.findByAccreditationId(undefined)
      ).rejects.toThrow()
    })

    it('throws error when accreditationId is empty string', async () => {
      await expect(repository.findByAccreditationId('')).rejects.toThrow()
    })

    it('returns canonicalSource embedded when stored as embedded', async ({
      insertWasteBalance
    }) => {
      const wasteBalance = buildWasteBalance({
        accreditationId: 'acc-marker-embedded',
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      })

      await insertWasteBalance(wasteBalance)

      const result = await repository.findByAccreditationId(
        'acc-marker-embedded'
      )

      expect(result.canonicalSource).toBe(
        WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      )
    })

    it('returns canonicalSource ledger when stored as ledger', async ({
      insertWasteBalance
    }) => {
      const wasteBalance = buildWasteBalance({
        accreditationId: 'acc-marker-ledger',
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER
      })

      await insertWasteBalance(wasteBalance)

      const result = await repository.findByAccreditationId('acc-marker-ledger')

      expect(result.canonicalSource).toBe(WASTE_BALANCE_CANONICAL_SOURCE.LEDGER)
    })

    describe('marker-aware amount resolution', () => {
      it('returns embedded amount and availableAmount when marker is embedded', async ({
        insertWasteBalance,
        ledgerRepository
      }) => {
        await insertWasteBalance(
          buildWasteBalance({
            accreditationId: 'acc-marker-embedded-amounts',
            canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED,
            amount: 250,
            availableAmount: 200
          })
        )

        await ledgerRepository.insertTransactions([
          buildLedgerTransaction({
            accreditationId: 'acc-marker-embedded-amounts',
            number: 1,
            closingBalance: { amount: 999, availableAmount: 999 }
          })
        ])

        const result = await repository.findByAccreditationId(
          'acc-marker-embedded-amounts'
        )

        expect(result.amount).toBe(250)
        expect(result.availableAmount).toBe(200)
      })

      it('returns embedded amount and availableAmount when marker is migrating', async ({
        insertWasteBalance,
        ledgerRepository
      }) => {
        await insertWasteBalance(
          buildWasteBalance({
            accreditationId: 'acc-marker-migrating-amounts',
            canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING,
            amount: 75,
            availableAmount: 50
          })
        )

        await ledgerRepository.insertTransactions([
          buildLedgerTransaction({
            accreditationId: 'acc-marker-migrating-amounts',
            number: 1,
            closingBalance: { amount: 999, availableAmount: 999 }
          })
        ])

        const result = await repository.findByAccreditationId(
          'acc-marker-migrating-amounts'
        )

        expect(result.amount).toBe(75)
        expect(result.availableAmount).toBe(50)
      })

      it('substitutes amount and availableAmount from the latest ledger transaction when marker is ledger', async ({
        insertWasteBalance,
        ledgerRepository
      }) => {
        await insertWasteBalance(
          buildWasteBalance({
            accreditationId: 'acc-marker-ledger-amounts',
            canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER,
            amount: 999,
            availableAmount: 999
          })
        )

        await ledgerRepository.insertTransactions([
          buildLedgerTransaction({
            accreditationId: 'acc-marker-ledger-amounts',
            number: 1,
            closingBalance: { amount: 100, availableAmount: 90 }
          }),
          buildLedgerTransaction({
            accreditationId: 'acc-marker-ledger-amounts',
            number: 2,
            closingBalance: { amount: 175, availableAmount: 150 }
          })
        ])

        const result = await repository.findByAccreditationId(
          'acc-marker-ledger-amounts'
        )

        expect(result.amount).toBe(175)
        expect(result.availableAmount).toBe(150)
      })

      it('returns zero amounts when marker is ledger and no ledger transactions exist', async ({
        insertWasteBalance
      }) => {
        await insertWasteBalance(
          buildWasteBalance({
            accreditationId: 'acc-marker-ledger-empty',
            canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER,
            amount: 999,
            availableAmount: 999
          })
        )

        const result = await repository.findByAccreditationId(
          'acc-marker-ledger-empty'
        )

        expect(result.amount).toBe(0)
        expect(result.availableAmount).toBe(0)
      })

      it('preserves the canonicalSource marker on the returned document', async ({
        insertWasteBalance,
        ledgerRepository
      }) => {
        await insertWasteBalance(
          buildWasteBalance({
            accreditationId: 'acc-marker-ledger-preserved',
            canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER
          })
        )

        await ledgerRepository.insertTransactions([
          buildLedgerTransaction({
            accreditationId: 'acc-marker-ledger-preserved',
            number: 1,
            closingBalance: { amount: 10, availableAmount: 10 }
          })
        ])

        const result = await repository.findByAccreditationId(
          'acc-marker-ledger-preserved'
        )

        expect(result.canonicalSource).toBe(
          WASTE_BALANCE_CANONICAL_SOURCE.LEDGER
        )
      })
    })

    it('returns waste balance with all transaction fields intact', async ({
      insertWasteBalance
    }) => {
      const wasteBalance = buildWasteBalance({
        accreditationId: 'acc-456',
        transactions: [
          {
            _id: 'txn-1',
            type: 'credit',
            createdAt: '2025-01-15T10:00:00.000Z',
            createdBy: {
              id: 'user-1'
            },
            amount: 150,
            openingAmount: 0,
            closingAmount: 150,
            openingAvailableAmount: 0,
            closingAvailableAmount: 150,
            entities: [
              {
                id: 'waste-record-123',
                type: 'waste_record:received'
              }
            ]
          }
        ]
      })

      await insertWasteBalance(wasteBalance)

      const result = await repository.findByAccreditationId('acc-456')

      expect(result).not.toBeNull()
      expect(result.transactions).toHaveLength(1)
      expect(result.transactions[0]._id).toBe('txn-1')
      expect(result.transactions[0].type).toBe('credit')
      expect(result.transactions[0].createdBy.id).toBe('user-1')
      expect(result.transactions[0].entities).toHaveLength(1)
      expect(result.transactions[0].entities[0].type).toBe(
        'waste_record:received'
      )
    })
  })
}
