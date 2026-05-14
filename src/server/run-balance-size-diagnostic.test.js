import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runBalanceSizeDiagnostic } from './run-balance-size-diagnostic.js'
import { logger } from '#common/helpers/logging/logger.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}))

const HALF_LIMIT_BYTES = 8 * 1024 * 1024

describe('runBalanceSizeDiagnostic', () => {
  let mockServer
  let mockLock
  let mockAggregate
  let mockToArray

  beforeEach(() => {
    vi.clearAllMocks()

    mockLock = { free: vi.fn().mockResolvedValue(undefined) }

    mockToArray = vi.fn().mockResolvedValue([])
    mockAggregate = vi.fn().mockReturnValue({ toArray: mockToArray })
    const db = {
      collection: vi.fn().mockReturnValue({ aggregate: mockAggregate })
    }

    mockServer = {
      db,
      locker: {
        lock: vi.fn().mockResolvedValue(mockLock)
      }
    }
  })

  it('acquires a lock scoped to the diagnostic and releases it afterwards', async () => {
    await runBalanceSizeDiagnostic(mockServer)

    expect(mockServer.locker.lock).toHaveBeenCalledWith(
      'balance-size-diagnostic'
    )
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('skips running when the lock is held by another instance', async () => {
    mockServer.locker.lock.mockResolvedValue(null)

    await runBalanceSizeDiagnostic(mockServer)

    expect(mockServer.db.collection).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping waste-balance size diagnostic'
    })
  })

  it('runs the aggregation against the waste-balances collection with allowDiskUse', async () => {
    await runBalanceSizeDiagnostic(mockServer)

    expect(mockServer.db.collection).toHaveBeenCalledWith('waste-balances')
    expect(mockAggregate).toHaveBeenCalledWith(expect.any(Array), {
      allowDiskUse: true
    })
  })

  it('uses a pipeline that excludes ledger-canonical docs, projects bsonSize from $$ROOT, sorts descending, and limits to 10', async () => {
    await runBalanceSizeDiagnostic(mockServer)

    const [pipeline] = mockAggregate.mock.calls[0]
    expect(pipeline).toEqual([
      { $match: { canonicalSource: { $ne: 'ledger' } } },
      {
        $project: {
          _id: 0,
          organisationId: 1,
          accreditationId: 1,
          transactionCount: { $size: { $ifNull: ['$transactions', []] } },
          bsonSize: { $bsonSize: '$$ROOT' }
        }
      },
      { $sort: { bsonSize: -1 } },
      { $limit: 10 }
    ])
  })

  it('logs the start of the diagnostic before running the aggregation', async () => {
    await runBalanceSizeDiagnostic(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Running waste-balance size diagnostic (top 10 by descending bsonSize)'
    })
  })

  it('logs a no-data line when the aggregation returns no embedded balances', async () => {
    mockToArray.mockResolvedValue([])

    await runBalanceSizeDiagnostic(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message: 'Waste-balance size diagnostic: no embedded balances found'
    })
  })

  it('logs one snapshot line per result with the same fields as the per-write growth log', async () => {
    mockToArray.mockResolvedValue([
      {
        organisationId: 'org-A',
        accreditationId: 'acc-1',
        transactionCount: 42,
        bsonSize: HALF_LIMIT_BYTES
      },
      {
        organisationId: 'org-B',
        accreditationId: 'acc-2',
        transactionCount: 7,
        bsonSize: 1024
      }
    ])

    await runBalanceSizeDiagnostic(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste balance document size snapshot: organisationId=org-A accreditationId=acc-1 transactionCount=42 bsonSize=8388608 percentOfBsonLimit=50'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste balance document size snapshot: organisationId=org-B accreditationId=acc-2 transactionCount=7 bsonSize=1024 percentOfBsonLimit=0.01'
    })
  })

  it('releases the lock and logs an error when the aggregation throws', async () => {
    const error = new Error('aggregate exploded')
    mockAggregate.mockImplementation(() => {
      throw error
    })

    await runBalanceSizeDiagnostic(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run waste-balance size diagnostic'
    })
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    mockServer.locker.lock.mockRejectedValue(error)

    await runBalanceSizeDiagnostic(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run waste-balance size diagnostic'
    })
  })
})
