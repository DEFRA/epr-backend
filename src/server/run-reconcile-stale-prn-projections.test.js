import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { createPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/mongodb.js'
import { createMongoLedgerRepository } from '#waste-balances/repository/ledger-mongodb.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { reconcileStalePrnProjections } from '#packaging-recycling-notes/application/reconcile-stale-prn-projections.js'
import { config } from '../config.js'

import { runReconcileStalePrnProjections } from './run-reconcile-stale-prn-projections.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('#packaging-recycling-notes/repository/mongodb.js', () => ({
  createPackagingRecyclingNotesRepository: vi.fn(),
  COLLECTION_NAME: 'packaging-recycling-notes'
}))
vi.mock('#waste-balances/repository/ledger-mongodb.js', () => ({
  createMongoLedgerRepository: vi.fn()
}))
vi.mock('#waste-balances/application/waste-balance-service.js', () => ({
  createWasteBalanceService: vi.fn()
}))
vi.mock(
  '#packaging-recycling-notes/application/reconcile-stale-prn-projections.js',
  () => ({
    reconcileStalePrnProjections: vi.fn()
  })
)
vi.mock('../config.js', () => ({ config: { get: vi.fn() } }))

const cleanResult = {
  scanned: 2,
  drifting: 0,
  repaired: 0,
  stillDrifting: 0,
  failed: 0,
  reports: []
}

describe('runReconcileStalePrnProjections', () => {
  /** @type {*} */
  let mockServer
  /** @type {*} */
  let mockLock

  beforeEach(() => {
    vi.clearAllMocks()

    mockLock = { free: vi.fn().mockResolvedValue(undefined) }
    mockServer = {
      db: { collection: vi.fn().mockReturnValue({}) },
      locker: { lock: vi.fn().mockResolvedValue(mockLock) }
    }

    vi.mocked(createPackagingRecyclingNotesRepository).mockResolvedValue(
      () => /** @type {*} */ ({ persistProjection: vi.fn() })
    )
    vi.mocked(createMongoLedgerRepository).mockResolvedValue(
      () => /** @type {*} */ ({})
    )
    vi.mocked(createWasteBalanceService).mockReturnValue(/** @type {*} */ ({}))
    vi.mocked(reconcileStalePrnProjections).mockResolvedValue(cleanResult)
    vi.mocked(config.get).mockReturnValue(false)
  })

  it('runs in dry-run when the feature flag is off, and reports the summary', async () => {
    await runReconcileStalePrnProjections(mockServer)

    expect(config.get).toHaveBeenCalledWith(
      'featureFlags.reconcileStalePrnProjections'
    )
    expect(mockServer.db.collection).toHaveBeenCalledWith(
      'packaging-recycling-notes'
    )
    expect(reconcileStalePrnProjections).toHaveBeenCalledWith(
      expect.anything(),
      {
        isDryRun: true
      }
    )
    expect(mockServer.locker.lock).toHaveBeenCalledWith(
      'reconcile-stale-prn-projections'
    )
    expect(mockLock.free).toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Reconcile stale PRN projections (dry-run): scanned=2 drifting=0 repaired=0 stillDrifting=0 failed=0'
    })
  })

  it('repairs and logs each drift finding when the feature flag is on', async () => {
    vi.mocked(config.get).mockReturnValue(true)
    vi.mocked(reconcileStalePrnProjections).mockResolvedValue({
      scanned: 1,
      drifting: 1,
      repaired: 1,
      stillDrifting: 0,
      failed: 0,
      reports: [
        {
          prnId: 'prn-1',
          prnNumber: 'TT2600001',
          currentStatus: 'awaiting_acceptance',
          lastAppliedEventNumber: 2,
          unappliedCount: 1,
          minUnappliedNumber: 3,
          wouldBecomeStatus: 'awaiting_cancellation'
        }
      ]
    })

    await runReconcileStalePrnProjections(mockServer)

    expect(reconcileStalePrnProjections).toHaveBeenCalledWith(
      expect.anything(),
      {
        isDryRun: false
      }
    )
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Stale PRN projection: prnId=prn-1 prnNumber=TT2600001 currentStatus=awaiting_acceptance lastAppliedEventNumber=2 unapplied=1 minUnappliedNumber=3 wouldBecomeStatus=awaiting_cancellation'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Reconcile stale PRN projections (repair): scanned=1 drifting=1 repaired=1 stillDrifting=0 failed=0'
    })
  })

  it('skips the run when the lock is held by another instance', async () => {
    mockServer.locker.lock.mockResolvedValue(null)

    await runReconcileStalePrnProjections(mockServer)

    expect(reconcileStalePrnProjections).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping reconcile stale PRN projections'
    })
  })

  it('releases the lock and logs an error when the scan throws', async () => {
    const error = new Error('mongo unavailable')
    vi.mocked(reconcileStalePrnProjections).mockRejectedValue(error)

    await runReconcileStalePrnProjections(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run reconcile stale PRN projections'
    })
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    mockServer.locker.lock.mockRejectedValue(error)

    await runReconcileStalePrnProjections(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run reconcile stale PRN projections'
    })
  })
})
