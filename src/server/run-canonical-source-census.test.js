import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runCanonicalSourceCensus } from './run-canonical-source-census.js'
import { logger } from '#common/helpers/logging/logger.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}))

describe('runCanonicalSourceCensus', () => {
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

  it('acquires a lock scoped to the census and releases it afterwards', async () => {
    await runCanonicalSourceCensus(mockServer)

    expect(mockServer.locker.lock).toHaveBeenCalledWith(
      'canonical-source-census'
    )
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('skips running when the lock is held by another instance', async () => {
    mockServer.locker.lock.mockResolvedValue(null)

    await runCanonicalSourceCensus(mockServer)

    expect(mockServer.db.collection).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping canonical-source census'
    })
  })

  it('groups the waste-balances collection by canonicalSource', async () => {
    await runCanonicalSourceCensus(mockServer)

    expect(mockServer.db.collection).toHaveBeenCalledWith('waste-balances')
    const [pipeline] = mockAggregate.mock.calls[0]
    expect(pipeline).toEqual([
      { $group: { _id: '$canonicalSource', count: { $sum: 1 } } }
    ])
  })

  it('emits a single census line with each bucket count and the total', async () => {
    mockToArray.mockResolvedValue([
      { _id: 'embedded', count: 10 },
      { _id: 'migrating', count: 3 },
      { _id: 'ledger', count: 7 }
    ])

    await runCanonicalSourceCensus(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste balance canonicalSource census: embedded=10 migrating=3 ledger=7 total=20'
    })
  })

  it('counts docs with a missing or unrecognised canonicalSource as embedded', async () => {
    mockToArray.mockResolvedValue([
      { _id: 'embedded', count: 5 },
      { _id: null, count: 2 },
      { _id: 'legacy', count: 1 }
    ])

    await runCanonicalSourceCensus(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste balance canonicalSource census: embedded=8 migrating=0 ledger=0 total=8'
    })
  })

  it('reports zeroes across all buckets when the collection is empty', async () => {
    mockToArray.mockResolvedValue([])

    await runCanonicalSourceCensus(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste balance canonicalSource census: embedded=0 migrating=0 ledger=0 total=0'
    })
  })

  it('releases the lock and logs an error when the aggregation throws', async () => {
    const error = new Error('aggregate exploded')
    mockAggregate.mockImplementation(() => {
      throw error
    })

    await runCanonicalSourceCensus(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run canonical-source census'
    })
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    mockServer.locker.lock.mockRejectedValue(error)

    await runCanonicalSourceCensus(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run canonical-source census'
    })
  })
})
