import { describe, it, expect, vi } from 'vitest'
import { findBalanceByPartition } from './read-balance.js'

describe('findBalanceByPartition', () => {
  it('returns null when the partition has no events', async () => {
    const streamRepository = {
      findLatestByPartition: vi.fn().mockResolvedValue(null)
    }

    const result = await findBalanceByPartition(streamRepository, {
      registrationId: 'reg-1',
      accreditationId: 'acc-1'
    })

    expect(result).toBeNull()
    expect(streamRepository.findLatestByPartition).toHaveBeenCalledWith(
      'reg-1',
      'acc-1'
    )
  })

  it('resolves amounts from the latest event closing balance', async () => {
    const streamRepository = {
      findLatestByPartition: vi.fn().mockResolvedValue({
        organisationId: 'org-1',
        registrationId: 'reg-1',
        accreditationId: 'acc-1',
        closingBalance: { amount: 175, availableAmount: 150 }
      })
    }

    const result = await findBalanceByPartition(streamRepository, {
      registrationId: 'reg-1',
      accreditationId: 'acc-1'
    })

    expect(result).toEqual({
      organisationId: 'org-1',
      registrationId: 'reg-1',
      accreditationId: 'acc-1',
      amount: 175,
      availableAmount: 150
    })
  })
})
