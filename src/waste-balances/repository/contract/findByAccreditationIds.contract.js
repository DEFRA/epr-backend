import { describe, beforeEach, expect } from 'vitest'
import { WASTE_BALANCE_CANONICAL_SOURCE } from '../../domain/model.js'
import { buildWasteBalance } from './test-data.js'
import { buildLedgerTransaction } from '../ledger-test-data.js'

export const testFindByAccreditationIdsBehaviour = (it) => {
  describe('findByAccreditationIds', () => {
    let repository

    beforeEach(async ({ wasteBalancesRepository }) => {
      repository = await wasteBalancesRepository()
    })

    it('returns empty array when no waste balances exist', async () => {
      const result = await repository.findByAccreditationIds([
        'acc-nonexistent'
      ])

      expect(result).toEqual([])
    })

    it('returns waste balances for multiple accreditation IDs', async ({
      insertWasteBalances
    }) => {
      const balance1 = buildWasteBalance({
        accreditationId: 'acc-1',
        amount: 100,
        availableAmount: 80
      })
      const balance2 = buildWasteBalance({
        accreditationId: 'acc-2',
        amount: 200,
        availableAmount: 150
      })

      await insertWasteBalances([balance1, balance2])

      const result = await repository.findByAccreditationIds(['acc-1', 'acc-2'])

      expect(result).toHaveLength(2)
      const accIds = result.map((r) => r.accreditationId)
      expect(accIds).toContain('acc-1')
      expect(accIds).toContain('acc-2')
    })

    it('returns only matching waste balances', async ({
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

      const result = await repository.findByAccreditationIds(['acc-1', 'acc-3'])

      expect(result).toHaveLength(2)
      const accIds = result.map((r) => r.accreditationId)
      expect(accIds).toContain('acc-1')
      expect(accIds).toContain('acc-3')
      expect(accIds).not.toContain('acc-2')
    })

    it('returns single waste balance when only one ID matches', async ({
      insertWasteBalance
    }) => {
      const wasteBalance = buildWasteBalance({
        accreditationId: 'acc-123',
        amount: 500,
        availableAmount: 400
      })

      await insertWasteBalance(wasteBalance)

      const result = await repository.findByAccreditationIds(['acc-123'])

      expect(result).toHaveLength(1)
      expect(result[0].accreditationId).toBe('acc-123')
      expect(result[0].amount).toBe(500)
      expect(result[0].availableAmount).toBe(400)
    })

    it('returns empty array when none of the IDs match', async ({
      insertWasteBalances
    }) => {
      const balance1 = buildWasteBalance({ accreditationId: 'acc-1' })
      const balance2 = buildWasteBalance({ accreditationId: 'acc-2' })

      await insertWasteBalances([balance1, balance2])

      const result = await repository.findByAccreditationIds([
        'acc-nonexistent-1',
        'acc-nonexistent-2'
      ])

      expect(result).toEqual([])
    })

    it('handles mixed existing and non-existing IDs', async ({
      insertWasteBalance
    }) => {
      const wasteBalance = buildWasteBalance({
        accreditationId: 'acc-exists',
        amount: 100
      })

      await insertWasteBalance(wasteBalance)

      const result = await repository.findByAccreditationIds([
        'acc-exists',
        'acc-not-exists'
      ])

      expect(result).toHaveLength(1)
      expect(result[0].accreditationId).toBe('acc-exists')
    })

    it('returns empty array for empty input array', async () => {
      const result = await repository.findByAccreditationIds([])

      expect(result).toEqual([])
    })

    it('preserves canonicalSource per balance across the batch', async ({
      insertWasteBalances
    }) => {
      const onEmbedded = buildWasteBalance({
        accreditationId: 'acc-mixed-embedded',
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      })
      const onLedger = buildWasteBalance({
        accreditationId: 'acc-mixed-ledger',
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER
      })

      await insertWasteBalances([onEmbedded, onLedger])

      const result = await repository.findByAccreditationIds([
        'acc-mixed-embedded',
        'acc-mixed-ledger'
      ])

      const byId = Object.fromEntries(result.map((b) => [b.accreditationId, b]))
      expect(byId['acc-mixed-embedded'].canonicalSource).toBe(
        WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      )
      expect(byId['acc-mixed-ledger'].canonicalSource).toBe(
        WASTE_BALANCE_CANONICAL_SOURCE.LEDGER
      )
    })

    describe('marker-aware amount resolution per balance', () => {
      it('substitutes amounts only for balances whose marker is ledger', async ({
        insertWasteBalances,
        ledgerRepository
      }) => {
        await insertWasteBalances([
          buildWasteBalance({
            accreditationId: 'acc-batch-embedded',
            canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED,
            amount: 100,
            availableAmount: 80
          }),
          buildWasteBalance({
            accreditationId: 'acc-batch-migrating',
            canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING,
            amount: 200,
            availableAmount: 150
          }),
          buildWasteBalance({
            accreditationId: 'acc-batch-ledger',
            canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER,
            amount: 999,
            availableAmount: 999
          })
        ])

        await ledgerRepository.insertTransactions([
          buildLedgerTransaction({
            accreditationId: 'acc-batch-embedded',
            number: 1,
            closingBalance: { amount: 999, availableAmount: 999 }
          }),
          buildLedgerTransaction({
            accreditationId: 'acc-batch-migrating',
            number: 1,
            closingBalance: { amount: 999, availableAmount: 999 }
          }),
          buildLedgerTransaction({
            accreditationId: 'acc-batch-ledger',
            number: 1,
            closingBalance: { amount: 50, availableAmount: 40 }
          }),
          buildLedgerTransaction({
            accreditationId: 'acc-batch-ledger',
            number: 2,
            closingBalance: { amount: 75, availableAmount: 60 }
          })
        ])

        const result = await repository.findByAccreditationIds([
          'acc-batch-embedded',
          'acc-batch-migrating',
          'acc-batch-ledger'
        ])

        const byId = Object.fromEntries(
          result.map((b) => [b.accreditationId, b])
        )
        expect(byId['acc-batch-embedded'].amount).toBe(100)
        expect(byId['acc-batch-embedded'].availableAmount).toBe(80)
        expect(byId['acc-batch-migrating'].amount).toBe(200)
        expect(byId['acc-batch-migrating'].availableAmount).toBe(150)
        expect(byId['acc-batch-ledger'].amount).toBe(75)
        expect(byId['acc-batch-ledger'].availableAmount).toBe(60)
      })
    })

    it('returns waste balance with all fields intact', async ({
      insertWasteBalance
    }) => {
      const wasteBalance = buildWasteBalance({
        accreditationId: 'acc-full',
        organisationId: 'org-test',
        amount: 250,
        availableAmount: 200,
        version: 3,
        transactions: [
          {
            _id: 'txn-1',
            type: 'credit',
            amount: 250
          }
        ]
      })

      await insertWasteBalance(wasteBalance)

      const result = await repository.findByAccreditationIds(['acc-full'])

      expect(result).toHaveLength(1)
      expect(result[0].accreditationId).toBe('acc-full')
      expect(result[0].organisationId).toBe('org-test')
      expect(result[0].amount).toBe(250)
      expect(result[0].availableAmount).toBe(200)
      expect(result[0].version).toBe(3)
      expect(result[0].transactions).toBeDefined()
    })
  })
}
