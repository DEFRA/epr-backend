import { describe, beforeEach, expect } from 'vitest'
import { buildWasteBalance } from './test-data.js'
import { buildStreamEvent } from '../stream-test-data.js'

/**
 * @typedef {object} WasteBalanceContractContext
 * @property {import('../port.js').WasteBalancesRepositoryFactory} wasteBalancesRepository
 */

export const testFindByAccreditationIdsBehaviour = (it) => {
  describe('findByAccreditationIds', () => {
    let repository

    beforeEach(
      async (
        /** @type {WasteBalanceContractContext} */ { wasteBalancesRepository }
      ) => {
        repository = await wasteBalancesRepository()
      }
    )

    it('returns empty array when no waste balances exist', async () => {
      const result = await repository.findByAccreditationIds([
        'acc-nonexistent'
      ])

      expect(result).toEqual([])
    })

    it('returns waste balances for multiple accreditation IDs', async ({
      insertWasteBalances,
      streamRepository
    }) => {
      const balance1 = buildWasteBalance({
        accreditationId: 'acc-1',
        registrationId: 'reg-1'
      })
      const balance2 = buildWasteBalance({
        accreditationId: 'acc-2',
        registrationId: 'reg-2'
      })

      await insertWasteBalances([balance1, balance2])
      await streamRepository.appendEvent(
        buildStreamEvent({
          accreditationId: 'acc-1',
          registrationId: 'reg-1',
          number: 1,
          closingBalance: { amount: 100, availableAmount: 80 }
        })
      )
      await streamRepository.appendEvent(
        buildStreamEvent({
          accreditationId: 'acc-2',
          registrationId: 'reg-2',
          number: 1,
          closingBalance: { amount: 200, availableAmount: 150 }
        })
      )

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
        registrationId: 'reg-1'
      })
      const balance2 = buildWasteBalance({
        accreditationId: 'acc-2',
        registrationId: 'reg-2'
      })
      const balance3 = buildWasteBalance({
        accreditationId: 'acc-3',
        registrationId: 'reg-3'
      })

      await insertWasteBalances([balance1, balance2, balance3])

      const result = await repository.findByAccreditationIds(['acc-1', 'acc-3'])

      expect(result).toHaveLength(2)
      const accIds = result.map((r) => r.accreditationId)
      expect(accIds).toContain('acc-1')
      expect(accIds).toContain('acc-3')
      expect(accIds).not.toContain('acc-2')
    })

    it('returns single waste balance with amounts resolved from the stream when only one ID matches', async ({
      insertWasteBalance,
      streamRepository
    }) => {
      const wasteBalance = buildWasteBalance({
        accreditationId: 'acc-123',
        registrationId: 'reg-1'
      })

      await insertWasteBalance(wasteBalance)
      await streamRepository.appendEvent(
        buildStreamEvent({
          accreditationId: 'acc-123',
          registrationId: 'reg-1',
          number: 1,
          closingBalance: { amount: 500, availableAmount: 400 }
        })
      )

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
        registrationId: 'reg-1'
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

    describe('amount resolution per balance from the stream', () => {
      it('resolves amounts independently for each balance and zeroes those with no events', async ({
        insertWasteBalances,
        streamRepository
      }) => {
        await insertWasteBalances([
          buildWasteBalance({
            accreditationId: 'acc-batch-empty',
            registrationId: 'reg-empty'
          }),
          buildWasteBalance({
            accreditationId: 'acc-batch-ledger',
            registrationId: 'reg-1'
          })
        ])

        await streamRepository.appendEvent(
          buildStreamEvent({
            accreditationId: 'acc-batch-ledger',
            registrationId: 'reg-1',
            number: 1,
            closingBalance: { amount: 50, availableAmount: 40 }
          })
        )
        await streamRepository.appendEvent(
          buildStreamEvent({
            accreditationId: 'acc-batch-ledger',
            registrationId: 'reg-1',
            number: 2,
            closingBalance: { amount: 75, availableAmount: 60 }
          })
        )

        const result = await repository.findByAccreditationIds([
          'acc-batch-empty',
          'acc-batch-ledger'
        ])

        const byId = Object.fromEntries(
          result.map((b) => [b.accreditationId, b])
        )
        expect(byId['acc-batch-empty'].amount).toBe(0)
        expect(byId['acc-batch-empty'].availableAmount).toBe(0)
        expect(byId['acc-batch-ledger'].amount).toBe(75)
        expect(byId['acc-batch-ledger'].availableAmount).toBe(60)
      })
    })

    it('returns waste balance with identity fields intact', async ({
      insertWasteBalance,
      streamRepository
    }) => {
      const wasteBalance = buildWasteBalance({
        accreditationId: 'acc-full',
        organisationId: 'org-test',
        registrationId: 'reg-1',
        version: 3
      })

      await insertWasteBalance(wasteBalance)
      await streamRepository.appendEvent(
        buildStreamEvent({
          accreditationId: 'acc-full',
          registrationId: 'reg-1',
          number: 1,
          closingBalance: { amount: 250, availableAmount: 200 }
        })
      )

      const result = await repository.findByAccreditationIds(['acc-full'])

      expect(result).toHaveLength(1)
      expect(result[0].accreditationId).toBe('acc-full')
      expect(result[0].organisationId).toBe('org-test')
      expect(result[0].amount).toBe(250)
      expect(result[0].availableAmount).toBe(200)
      expect(result[0].version).toBe(3)
    })
  })
}
