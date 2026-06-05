import { describe, beforeEach, expect } from 'vitest'
import { buildWasteBalance } from './test-data.js'
import { buildStreamEvent } from '../stream-test-data.js'

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

    it('returns the waste balance shell with amounts resolved from the stream', async ({
      insertWasteBalance,
      streamRepository
    }) => {
      await insertWasteBalance(
        buildWasteBalance({
          accreditationId: 'acc-123',
          organisationId: 'org-1',
          registrationId: 'reg-1'
        })
      )
      await streamRepository.appendEvent(
        buildStreamEvent({
          accreditationId: 'acc-123',
          registrationId: 'reg-1',
          number: 1,
          closingBalance: { amount: 250, availableAmount: 200 }
        })
      )

      const result = await repository.findByAccreditationId('acc-123')

      expect(result).not.toBeNull()
      expect(result.accreditationId).toBe('acc-123')
      expect(result.organisationId).toBe('org-1')
      expect(result.amount).toBe(250)
      expect(result.availableAmount).toBe(200)
    })

    it('returns correct waste balance when multiple balances exist', async ({
      insertWasteBalances,
      streamRepository
    }) => {
      await insertWasteBalances([
        buildWasteBalance({
          accreditationId: 'acc-1',
          registrationId: 'reg-1'
        }),
        buildWasteBalance({
          accreditationId: 'acc-2',
          registrationId: 'reg-2'
        }),
        buildWasteBalance({ accreditationId: 'acc-3', registrationId: 'reg-3' })
      ])
      await streamRepository.appendEvent(
        buildStreamEvent({
          accreditationId: 'acc-2',
          registrationId: 'reg-2',
          number: 1,
          closingBalance: { amount: 200, availableAmount: 200 }
        })
      )

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

    describe('amount resolution from the stream', () => {
      it('substitutes amount and availableAmount from the latest stream event', async ({
        insertWasteBalance,
        streamRepository
      }) => {
        await insertWasteBalance(
          buildWasteBalance({
            accreditationId: 'acc-ledger-amounts',
            registrationId: 'reg-1',
            amount: 999,
            availableAmount: 999
          })
        )

        await streamRepository.appendEvent(
          buildStreamEvent({
            accreditationId: 'acc-ledger-amounts',
            registrationId: 'reg-1',
            number: 1,
            closingBalance: { amount: 100, availableAmount: 90 }
          })
        )
        await streamRepository.appendEvent(
          buildStreamEvent({
            accreditationId: 'acc-ledger-amounts',
            registrationId: 'reg-1',
            number: 2,
            closingBalance: { amount: 175, availableAmount: 150 }
          })
        )

        const result =
          await repository.findByAccreditationId('acc-ledger-amounts')

        expect(result.amount).toBe(175)
        expect(result.availableAmount).toBe(150)
      })

      it('returns zero balances when no stream events exist', async ({
        insertWasteBalance
      }) => {
        await insertWasteBalance(
          buildWasteBalance({
            accreditationId: 'acc-ledger-empty',
            registrationId: 'reg-1',
            amount: 999,
            availableAmount: 999
          })
        )

        const result =
          await repository.findByAccreditationId('acc-ledger-empty')

        expect(result.amount).toBe(0)
        expect(result.availableAmount).toBe(0)
      })
    })
  })
}
