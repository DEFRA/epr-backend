import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'

import { reconcileStalePrnProjections } from './reconcile-stale-prn-projections.js'
import { runReconcileStalePrnProjections } from './run-reconcile-stale-prn-projections.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('#packaging-recycling-notes/repository/drift-query.mongodb.js', () => ({
  createDriftQuery: vi.fn()
}))
vi.mock('./reconcile-stale-prn-projections.js', () => ({
  reconcileStalePrnProjections: vi.fn()
}))

const cleanResult = {
  total: 2,
  drifting: 0,
  repaired: 0,
  folded: 0,
  stamped: 0,
  stillDrifting: 0,
  failed: 0,
  reports: [],
  failures: []
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
      app: {
        packagingRecyclingNotesRepository: { persistProjection: vi.fn() },
        wasteBalanceService: {}
      },
      db: { collection: vi.fn().mockReturnValue({}) },
      locker: { lock: vi.fn().mockResolvedValue(mockLock) }
    }

    vi.mocked(reconcileStalePrnProjections).mockResolvedValue(cleanResult)
  })

  it('sweeps under the lock and reports the summary', async () => {
    await runReconcileStalePrnProjections(mockServer)

    expect(mockServer.db.collection).toHaveBeenCalledWith(
      'packaging-recycling-notes'
    )
    expect(reconcileStalePrnProjections).toHaveBeenCalledWith(
      expect.objectContaining({
        prnRepository: mockServer.app.packagingRecyclingNotesRepository,
        service: mockServer.app.wasteBalanceService
      })
    )
    expect(mockServer.locker.lock).toHaveBeenCalledWith(
      'reconcile-stale-prn-projections'
    )
    expect(mockLock.free).toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Reconcile stale PRN projections: total=2 drifting=0 repaired=0 folded=0 stamped=0 stillDrifting=0 failed=0'
    })
  })

  it('logs each drift finding and failure', async () => {
    vi.mocked(reconcileStalePrnProjections).mockResolvedValue({
      total: 2,
      drifting: 1,
      repaired: 1,
      folded: 1,
      stamped: 0,
      stillDrifting: 0,
      failed: 1,
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
      ],
      failures: [{ prnId: 'prn-2', error: 'Error: connection reset' }]
    })

    await runReconcileStalePrnProjections(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Stale PRN projection: prnId=prn-1 prnNumber=TT2600001 currentStatus=awaiting_acceptance lastAppliedEventNumber=2 unapplied=1 minUnappliedNumber=3 wouldBecomeStatus=awaiting_cancellation'
    })
    expect(logger.error).toHaveBeenCalledWith({
      message: 'Reconcile failed for PRN prn-2: Error: connection reset'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Reconcile stale PRN projections: total=2 drifting=1 repaired=1 folded=1 stamped=0 stillDrifting=0 failed=1'
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
