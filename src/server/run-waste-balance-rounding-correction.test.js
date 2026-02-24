import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  runWasteBalanceRoundingCorrection,
  correctWasteBalance,
  hasRoundingError
} from './run-waste-balance-rounding-correction.js'
import { createWasteBalancesRepository } from '#repositories/waste-balances/mongodb.js'
import { createInMemoryWasteBalancesRepository } from '#repositories/waste-balances/inmemory.js'
import { WASTE_BALANCE_TRANSACTION_TYPE } from '#domain/waste-balances/model.js'

vi.mock('#repositories/waste-balances/mongodb.js', () => ({
  createWasteBalancesRepository: vi.fn()
}))

// ---------------------------------------------------------------------------
// Unit tests for pure helper functions
// ---------------------------------------------------------------------------

describe('hasRoundingError', () => {
  it('should return true for a value with more than 2 decimal places', () => {
    expect(hasRoundingError(537.5199999999999)).toBe(true)
  })

  it('should return false for a value already at 2 decimal places', () => {
    expect(hasRoundingError(537.52)).toBe(false)
  })

  it('should return false for an integer', () => {
    expect(hasRoundingError(100)).toBe(false)
  })

  it('should return false for zero', () => {
    expect(hasRoundingError(0)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// correctWasteBalance
// ---------------------------------------------------------------------------

describe('correctWasteBalance', () => {
  it('should return false when balance has no rounding error', async () => {
    const balance = {
      accreditationId: 'acc-1',
      amount: 100,
      availableAmount: 100
    }
    const repository = { applyRoundingCorrectionToWasteBalance: vi.fn() }
    const result = await correctWasteBalance(balance, repository)
    expect(result).toBe(false)
    expect(
      repository.applyRoundingCorrectionToWasteBalance
    ).not.toHaveBeenCalled()
  })

  it('should return true and apply correction when rounding error detected', async () => {
    const balance = {
      accreditationId: 'acc-1',
      amount: 537.5199999999999,
      availableAmount: 537.5199999999999
    }
    const repository = {
      applyRoundingCorrectionToWasteBalance: vi
        .fn()
        .mockResolvedValue(undefined)
    }
    const result = await correctWasteBalance(balance, repository)
    expect(result).toBe(true)
    expect(
      repository.applyRoundingCorrectionToWasteBalance
    ).toHaveBeenCalledWith({
      accreditationId: 'acc-1',
      correctedAmount: 537.52,
      correctedAvailableAmount: 537.52
    })
  })

  it('should apply independent corrections when amount and availableAmount have different drift', async () => {
    const balance = {
      accreditationId: 'acc-1',
      amount: 537.5199999999999,
      availableAmount: 100.0000000000001
    }
    const repository = {
      applyRoundingCorrectionToWasteBalance: vi
        .fn()
        .mockResolvedValue(undefined)
    }
    const result = await correctWasteBalance(balance, repository)
    expect(result).toBe(true)
    expect(
      repository.applyRoundingCorrectionToWasteBalance
    ).toHaveBeenCalledWith({
      accreditationId: 'acc-1',
      correctedAmount: 537.52,
      correctedAvailableAmount: 100
    })
  })

  it('should return true but skip save in dry-run mode', async () => {
    const balance = {
      accreditationId: 'acc-1',
      amount: 537.5199999999999,
      availableAmount: 537.5199999999999
    }
    const repository = {
      applyRoundingCorrectionToWasteBalance: vi.fn()
    }
    const result = await correctWasteBalance(balance, repository, {
      dryRun: true
    })
    expect(result).toBe(true)
    expect(
      repository.applyRoundingCorrectionToWasteBalance
    ).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// runWasteBalanceRoundingCorrection (server integration)
// ---------------------------------------------------------------------------

describe('runWasteBalanceRoundingCorrection', () => {
  let mockServer
  let mockRepository
  let mockLock

  beforeEach(() => {
    mockLock = {
      free: vi.fn().mockResolvedValue(undefined)
    }

    mockRepository = {
      findAll: vi.fn().mockResolvedValue([]),
      applyRoundingCorrectionToWasteBalance: vi
        .fn()
        .mockResolvedValue(undefined)
    }

    createWasteBalancesRepository.mockReturnValue(() => mockRepository)

    mockServer = {
      featureFlags: {
        getWasteBalanceRoundingCorrectionMode: vi
          .fn()
          .mockReturnValue('disabled')
      },
      locker: {
        lock: vi.fn().mockResolvedValue(mockLock)
      },
      db: {}
    }
  })

  it('should skip correction when feature flag is disabled', async () => {
    await runWasteBalanceRoundingCorrection(mockServer)
    expect(mockServer.locker.lock).not.toHaveBeenCalled()
  })

  it('should skip correction when unable to obtain lock', async () => {
    mockServer.featureFlags.getWasteBalanceRoundingCorrectionMode.mockReturnValue(
      'enabled'
    )
    mockServer.locker.lock.mockResolvedValue(null)

    await runWasteBalanceRoundingCorrection(mockServer)

    expect(mockRepository.findAll).not.toHaveBeenCalled()
  })

  it('should do nothing when there are no balances', async () => {
    mockServer.featureFlags.getWasteBalanceRoundingCorrectionMode.mockReturnValue(
      'enabled'
    )

    const result = await runWasteBalanceRoundingCorrection(mockServer)

    expect(result).toEqual({ dryRun: false, corrected: 0, total: 0 })
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('should correct balances with rounding errors', async () => {
    mockServer.featureFlags.getWasteBalanceRoundingCorrectionMode.mockReturnValue(
      'enabled'
    )
    mockRepository.findAll.mockResolvedValue([
      {
        accreditationId: 'acc-1',
        amount: 537.5199999999999,
        availableAmount: 537.5199999999999
      }
    ])

    const result = await runWasteBalanceRoundingCorrection(mockServer)

    expect(result).toEqual({ dryRun: false, corrected: 1, total: 1 })
    expect(
      mockRepository.applyRoundingCorrectionToWasteBalance
    ).toHaveBeenCalledWith({
      accreditationId: 'acc-1',
      correctedAmount: 537.52,
      correctedAvailableAmount: 537.52
    })
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('should skip already-correct balances', async () => {
    mockServer.featureFlags.getWasteBalanceRoundingCorrectionMode.mockReturnValue(
      'enabled'
    )
    mockRepository.findAll.mockResolvedValue([
      {
        accreditationId: 'acc-1',
        amount: 100,
        availableAmount: 100
      }
    ])

    const result = await runWasteBalanceRoundingCorrection(mockServer)

    expect(result).toEqual({ dryRun: false, corrected: 0, total: 1 })
    expect(
      mockRepository.applyRoundingCorrectionToWasteBalance
    ).not.toHaveBeenCalled()
  })

  it('should not apply corrections in dry-run mode', async () => {
    mockServer.featureFlags.getWasteBalanceRoundingCorrectionMode.mockReturnValue(
      'dry-run'
    )
    mockRepository.findAll.mockResolvedValue([
      {
        accreditationId: 'acc-1',
        amount: 537.5199999999999,
        availableAmount: 537.5199999999999
      }
    ])

    const result = await runWasteBalanceRoundingCorrection(mockServer)

    expect(result).toEqual({ dryRun: true, wouldCorrect: 1, total: 1 })
    expect(
      mockRepository.applyRoundingCorrectionToWasteBalance
    ).not.toHaveBeenCalled()
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('should continue processing after an individual balance error', async () => {
    mockServer.featureFlags.getWasteBalanceRoundingCorrectionMode.mockReturnValue(
      'enabled'
    )
    mockRepository.findAll.mockResolvedValue([
      {
        accreditationId: 'acc-error',
        amount: 537.5199999999999,
        availableAmount: 537.5199999999999
      },
      {
        accreditationId: 'acc-ok',
        amount: 100,
        availableAmount: 100
      }
    ])
    mockRepository.applyRoundingCorrectionToWasteBalance.mockRejectedValueOnce(
      new Error('DB write failed')
    )

    const result = await runWasteBalanceRoundingCorrection(mockServer)

    // acc-error threw → not counted; acc-ok had no error → not counted
    expect(result).toEqual({ dryRun: false, corrected: 0, total: 2 })
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('should release lock even when correction throws a fatal error', async () => {
    mockServer.featureFlags.getWasteBalanceRoundingCorrectionMode.mockReturnValue(
      'enabled'
    )
    mockRepository.findAll.mockRejectedValue(new Error('DB unavailable'))

    await expect(
      runWasteBalanceRoundingCorrection(mockServer)
    ).resolves.toBeUndefined()

    expect(mockLock.free).toHaveBeenCalled()
  })

  it('should handle errors gracefully and return undefined', async () => {
    mockServer.featureFlags.getWasteBalanceRoundingCorrectionMode.mockReturnValue(
      'enabled'
    )
    mockServer.locker.lock.mockRejectedValue(new Error('Lock service down'))

    await expect(
      runWasteBalanceRoundingCorrection(mockServer)
    ).resolves.toBeUndefined()
  })

  it('should create repository using server.db', async () => {
    mockServer.featureFlags.getWasteBalanceRoundingCorrectionMode.mockReturnValue(
      'enabled'
    )

    await runWasteBalanceRoundingCorrection(mockServer)

    expect(createWasteBalancesRepository).toHaveBeenCalledWith(mockServer.db)
  })

  describe('dry-run mode result', () => {
    it('should report wouldCorrect count', async () => {
      mockServer.featureFlags.getWasteBalanceRoundingCorrectionMode.mockReturnValue(
        'dry-run'
      )
      mockRepository.findAll.mockResolvedValue([
        {
          accreditationId: 'acc-1',
          amount: 537.5199999999999,
          availableAmount: 537.5199999999999
        },
        {
          accreditationId: 'acc-2',
          amount: 50,
          availableAmount: 50
        }
      ])

      const result = await runWasteBalanceRoundingCorrection(mockServer)

      expect(result).toEqual({ dryRun: true, wouldCorrect: 1, total: 2 })
    })
  })
})

// ---------------------------------------------------------------------------
// Integration tests using in-memory repository
// ---------------------------------------------------------------------------

/**
 * Build a minimal mock server wired to the given in-memory repository.
 * The mock for createWasteBalancesRepository must already be in place.
 */
function makeServer(repository, mode = 'enabled') {
  createWasteBalancesRepository.mockReturnValue(() => repository)
  return {
    featureFlags: {
      getWasteBalanceRoundingCorrectionMode: vi.fn().mockReturnValue(mode)
    },
    locker: { lock: vi.fn().mockResolvedValue({ free: vi.fn() }) },
    db: {}
  }
}

describe('runWasteBalanceRoundingCorrection with in-memory repository', () => {
  it('PAE-1082: corrects amount/availableAmount with accumulated addition drift', async () => {
    // Mirrors the real-world failure: multiple credits of 28.48, 27.96, 14.84
    // cause JavaScript to land on 537.5199999999999 instead of 537.52.
    const repository = createInMemoryWasteBalancesRepository([
      {
        id: 'balance-1',
        accreditationId: 'acc-pae-1082',
        organisationId: 'org-1',
        amount: 537.5199999999999,
        availableAmount: 537.5199999999999,
        transactions: [],
        version: 12,
        schemaVersion: 1
      }
    ])()

    await runWasteBalanceRoundingCorrection(makeServer(repository))

    const result = await repository.findByAccreditationId('acc-pae-1082')
    expect(result.amount).toBe(537.52)
    expect(result.availableAmount).toBe(537.52)
    expect(result.version).toBe(13)
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0].type).toBe(
      WASTE_BALANCE_TRANSACTION_TYPE.ROUNDING_CORRECTION
    )
    expect(result.transactions[0].openingAmount).toBe(537.5199999999999)
    expect(result.transactions[0].closingAmount).toBe(537.52)
    expect(result.transactions[0].openingAvailableAmount).toBe(
      537.5199999999999
    )
    expect(result.transactions[0].closingAvailableAmount).toBe(537.52)
  })

  it('corrects a small positive drift (amount just above the true value)', async () => {
    // 100.00000000000001 is a common result of summing values like 0.1 * 1000
    const repository = createInMemoryWasteBalancesRepository([
      {
        id: 'balance-2',
        accreditationId: 'acc-small-pos',
        organisationId: 'org-1',
        amount: 100.00000000000001,
        availableAmount: 100.00000000000001,
        transactions: [],
        version: 3,
        schemaVersion: 1
      }
    ])()

    await runWasteBalanceRoundingCorrection(makeServer(repository))

    const result = await repository.findByAccreditationId('acc-small-pos')
    expect(result.amount).toBe(100)
    expect(result.availableAmount).toBe(100)
    expect(result.version).toBe(4)
    expect(result.transactions[0].type).toBe(
      WASTE_BALANCE_TRANSACTION_TYPE.ROUNDING_CORRECTION
    )
  })

  it('corrects a small negative drift (amount just below the true value)', async () => {
    // Subtraction sequences can leave values slightly below the true 2dp figure
    const repository = createInMemoryWasteBalancesRepository([
      {
        id: 'balance-3',
        accreditationId: 'acc-small-neg',
        organisationId: 'org-1',
        amount: 49.99999999999999,
        availableAmount: 49.99999999999999,
        transactions: [],
        version: 7,
        schemaVersion: 1
      }
    ])()

    await runWasteBalanceRoundingCorrection(makeServer(repository))

    const result = await repository.findByAccreditationId('acc-small-neg')
    expect(result.amount).toBe(50)
    expect(result.availableAmount).toBe(50)
    expect(result.version).toBe(8)
  })

  it('corrects amount and availableAmount independently when their drift differs', async () => {
    // PRN ring-fence operations make amount and availableAmount move
    // independently, so they can accumulate different rounding errors.
    const repository = createInMemoryWasteBalancesRepository([
      {
        id: 'balance-4',
        accreditationId: 'acc-independent',
        organisationId: 'org-1',
        amount: 537.5199999999999, // → 537.52
        availableAmount: 100.00000000000001, // → 100.00
        transactions: [],
        version: 20,
        schemaVersion: 1
      }
    ])()

    await runWasteBalanceRoundingCorrection(makeServer(repository))

    const result = await repository.findByAccreditationId('acc-independent')
    expect(result.amount).toBe(537.52)
    expect(result.availableAmount).toBe(100)
    expect(result.version).toBe(21)
    expect(result.transactions[0].closingAmount).toBe(537.52)
    expect(result.transactions[0].closingAvailableAmount).toBe(100)
  })

  it('corrects only availableAmount when amount is already exact', async () => {
    const repository = createInMemoryWasteBalancesRepository([
      {
        id: 'balance-5',
        accreditationId: 'acc-avail-only',
        organisationId: 'org-1',
        amount: 537.52, // already correct
        availableAmount: 537.5199999999999, // drifted
        transactions: [],
        version: 5,
        schemaVersion: 1
      }
    ])()

    await runWasteBalanceRoundingCorrection(makeServer(repository))

    const result = await repository.findByAccreditationId('acc-avail-only')
    expect(result.amount).toBe(537.52)
    expect(result.availableAmount).toBe(537.52)
    expect(result.version).toBe(6)
    expect(result.transactions[0].openingAmount).toBe(537.52)
    expect(result.transactions[0].closingAmount).toBe(537.52) // unchanged
    expect(result.transactions[0].closingAvailableAmount).toBe(537.52)
  })

  it('corrects only amount when availableAmount is already exact', async () => {
    const repository = createInMemoryWasteBalancesRepository([
      {
        id: 'balance-6',
        accreditationId: 'acc-amount-only',
        organisationId: 'org-1',
        amount: 537.5199999999999, // drifted
        availableAmount: 200.5, // already correct
        transactions: [],
        version: 8,
        schemaVersion: 1
      }
    ])()

    await runWasteBalanceRoundingCorrection(makeServer(repository))

    const result = await repository.findByAccreditationId('acc-amount-only')
    expect(result.amount).toBe(537.52)
    expect(result.availableAmount).toBe(200.5)
    expect(result.version).toBe(9)
  })

  it('leaves already-correct balances untouched', async () => {
    const repository = createInMemoryWasteBalancesRepository([
      {
        id: 'balance-7',
        accreditationId: 'acc-exact',
        organisationId: 'org-1',
        amount: 1234.56,
        availableAmount: 789.01,
        transactions: [],
        version: 4,
        schemaVersion: 1
      }
    ])()

    const result = await runWasteBalanceRoundingCorrection(
      makeServer(repository)
    )

    expect(result).toEqual({ dryRun: false, corrected: 0, total: 1 })
    const balance = await repository.findByAccreditationId('acc-exact')
    expect(balance.version).toBe(4)
    expect(balance.transactions).toHaveLength(0)
  })

  it('processes a mixed batch, correcting only affected balances', async () => {
    const repository = createInMemoryWasteBalancesRepository([
      {
        id: 'b1',
        accreditationId: 'acc-broken-1',
        organisationId: 'org-1',
        amount: 537.5199999999999,
        availableAmount: 537.5199999999999,
        transactions: [],
        version: 1,
        schemaVersion: 1
      },
      {
        id: 'b2',
        accreditationId: 'acc-correct',
        organisationId: 'org-1',
        amount: 100,
        availableAmount: 100,
        transactions: [],
        version: 1,
        schemaVersion: 1
      },
      {
        id: 'b3',
        accreditationId: 'acc-broken-2',
        organisationId: 'org-1',
        amount: 49.99999999999999,
        availableAmount: 200.00000000000003,
        transactions: [],
        version: 2,
        schemaVersion: 1
      }
    ])()

    const result = await runWasteBalanceRoundingCorrection(
      makeServer(repository)
    )

    expect(result).toEqual({ dryRun: false, corrected: 2, total: 3 })

    const broken1 = await repository.findByAccreditationId('acc-broken-1')
    expect(broken1.amount).toBe(537.52)
    expect(broken1.availableAmount).toBe(537.52)
    expect(broken1.transactions).toHaveLength(1)

    const correct = await repository.findByAccreditationId('acc-correct')
    expect(correct.version).toBe(1)
    expect(correct.transactions).toHaveLength(0)

    const broken2 = await repository.findByAccreditationId('acc-broken-2')
    expect(broken2.amount).toBe(50)
    expect(broken2.availableAmount).toBe(200)
    expect(broken2.transactions).toHaveLength(1)
  })

  it('dry-run mode reports errors but does not write corrections', async () => {
    const repository = createInMemoryWasteBalancesRepository([
      {
        id: 'balance-dry',
        accreditationId: 'acc-dry',
        organisationId: 'org-1',
        amount: 537.5199999999999,
        availableAmount: 537.5199999999999,
        transactions: [],
        version: 5,
        schemaVersion: 1
      }
    ])()

    const result = await runWasteBalanceRoundingCorrection(
      makeServer(repository, 'dry-run')
    )

    expect(result).toEqual({ dryRun: true, wouldCorrect: 1, total: 1 })

    // Data must be unchanged
    const balance = await repository.findByAccreditationId('acc-dry')
    expect(balance.amount).toBe(537.5199999999999)
    expect(balance.availableAmount).toBe(537.5199999999999)
    expect(balance.version).toBe(5)
    expect(balance.transactions).toHaveLength(0)
  })

  it('re-running after a previous correction does not double-correct', async () => {
    // Seed a balance that has already had a ROUNDING_CORRECTION applied and
    // now holds exact 2dp values.  A second run should be a no-op.
    const repository = createInMemoryWasteBalancesRepository([
      {
        id: 'balance-already-fixed',
        accreditationId: 'acc-already-fixed',
        organisationId: 'org-1',
        amount: 537.52,
        availableAmount: 537.52,
        transactions: [
          {
            type: WASTE_BALANCE_TRANSACTION_TYPE.ROUNDING_CORRECTION,
            amount: 0.0000000000001,
            openingAmount: 537.5199999999999,
            closingAmount: 537.52,
            openingAvailableAmount: 537.5199999999999,
            closingAvailableAmount: 537.52
          }
        ],
        version: 6,
        schemaVersion: 1
      }
    ])()

    const result = await runWasteBalanceRoundingCorrection(
      makeServer(repository)
    )

    expect(result).toEqual({ dryRun: false, corrected: 0, total: 1 })
    const balance = await repository.findByAccreditationId('acc-already-fixed')
    expect(balance.version).toBe(6)
    expect(balance.transactions).toHaveLength(1) // no second correction appended
  })
})
