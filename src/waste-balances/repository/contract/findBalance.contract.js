import { describe, expect } from 'vitest'
import { buildStreamEvent } from '../stream-test-data.js'

export const testFindBalanceBehaviour = (it) => {
  describe('findBalance', () => {
    it('returns null when the partition has no events', async ({
      wasteBalancesRepository
    }) => {
      const repository = await wasteBalancesRepository()

      const result = await repository.findBalance({
        registrationId: 'reg-1',
        accreditationId: 'acc-nonexistent'
      })

      expect(result).toBeNull()
    })

    it('resolves amounts from the latest stream event closing balance', async ({
      wasteBalancesRepository,
      seedBalance
    }) => {
      const repository = await wasteBalancesRepository()
      await seedBalance({
        registrationId: 'reg-1',
        accreditationId: 'acc-123',
        organisationId: 'org-1',
        closingBalance: { amount: 250, availableAmount: 200 }
      })

      const result = await repository.findBalance({
        registrationId: 'reg-1',
        accreditationId: 'acc-123'
      })

      expect(result).toEqual({
        organisationId: 'org-1',
        registrationId: 'reg-1',
        accreditationId: 'acc-123',
        amount: 250,
        availableAmount: 200,
        eventNumber: 1,
        creditTotal: 100
      })
    })

    it('resolves the correct balance when multiple partitions exist', async ({
      wasteBalancesRepository,
      seedBalance
    }) => {
      const repository = await wasteBalancesRepository()
      await seedBalance({
        registrationId: 'reg-1',
        accreditationId: 'acc-1',
        closingBalance: { amount: 100, availableAmount: 100 }
      })
      await seedBalance({
        registrationId: 'reg-2',
        accreditationId: 'acc-2',
        closingBalance: { amount: 200, availableAmount: 200 }
      })

      const result = await repository.findBalance({
        registrationId: 'reg-2',
        accreditationId: 'acc-2'
      })

      expect(result.accreditationId).toBe('acc-2')
      expect(result.amount).toBe(200)
    })

    it('uses the latest event when a partition has several', async ({
      wasteBalancesRepository,
      streamRepository
    }) => {
      const repository = await wasteBalancesRepository()
      await streamRepository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-1',
          accreditationId: 'acc-ledger-amounts',
          number: 1,
          closingBalance: { amount: 100, availableAmount: 90 }
        })
      )
      await streamRepository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-1',
          accreditationId: 'acc-ledger-amounts',
          number: 2,
          closingBalance: { amount: 175, availableAmount: 150 }
        })
      )

      const result = await repository.findBalance({
        registrationId: 'reg-1',
        accreditationId: 'acc-ledger-amounts'
      })

      expect(result.amount).toBe(175)
      expect(result.availableAmount).toBe(150)
      expect(result.eventNumber).toBe(2)
    })
  })
}
