import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { findDuplicateBusinessEvents } from '#waste-balances/monitoring/duplicate-business-events.js'

import { runWasteBalanceDuplicateEventsReport } from './run-waste-balance-duplicate-events-report.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))
vi.mock('#waste-balances/monitoring/duplicate-business-events.js', () => ({
  findDuplicateBusinessEvents: vi.fn()
}))

/**
 * @param {{ prn?: import('mongodb').Document[], summaryLog?: import('mongodb').Document[] }} [findings]
 */
const seedFindings = ({ prn = [], summaryLog = [] } = {}) => {
  vi.mocked(findDuplicateBusinessEvents).mockResolvedValue({ prn, summaryLog })
}

describe('runWasteBalanceDuplicateEventsReport', () => {
  let mockServer
  let mockLock

  beforeEach(() => {
    vi.clearAllMocks()

    mockLock = { free: vi.fn().mockResolvedValue(undefined) }
    mockServer = {
      db: { collection: vi.fn().mockReturnValue({}) },
      locker: {
        lock: vi.fn().mockResolvedValue(mockLock)
      }
    }
  })

  it('acquires a lock scoped to the report and releases it afterwards', async () => {
    seedFindings()

    await runWasteBalanceDuplicateEventsReport(mockServer)

    expect(mockServer.locker.lock).toHaveBeenCalledWith(
      'waste-balance-duplicate-events-report'
    )
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('reads the waste-balance-events collection', async () => {
    seedFindings()

    await runWasteBalanceDuplicateEventsReport(mockServer)

    expect(mockServer.db.collection).toHaveBeenCalledWith(
      'waste-balance-events'
    )
  })

  it('skips the report when the lock is held by another instance', async () => {
    mockServer.locker.lock.mockResolvedValue(null)

    await runWasteBalanceDuplicateEventsReport(mockServer)

    expect(findDuplicateBusinessEvents).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Unable to obtain lock, skipping waste-balance duplicate events report'
    })
  })

  it('logs a zero-duplicate summary for a clean stream', async () => {
    seedFindings()

    await runWasteBalanceDuplicateEventsReport(mockServer)

    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste-balance duplicate events report: prnDuplicates=0 summaryLogDuplicates=0'
    })
  })

  it('logs a PRN duplicate finding at info with its identity, count and slot numbers', async () => {
    seedFindings({
      prn: [
        {
          _id: {
            registrationId: 'reg-1',
            accreditationId: 'acc-1',
            prnId: 'prn-1',
            kind: 'prn-created'
          },
          count: 2,
          numbers: [1, 2]
        }
      ]
    })

    await runWasteBalanceDuplicateEventsReport(mockServer)

    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Duplicate waste-balance event: registrationId=reg-1 accreditationId=acc-1 prnId=prn-1 kind=prn-created count=2 numbers=[1,2]'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste-balance duplicate events report: prnDuplicates=1 summaryLogDuplicates=0'
    })
  })

  it('logs a summary-log duplicate finding for a registered-only (null accreditation) partition', async () => {
    seedFindings({
      summaryLog: [
        {
          _id: {
            registrationId: 'reg-1',
            accreditationId: null,
            summaryLogId: 'log-1'
          },
          count: 3,
          numbers: [1, 2, 3]
        }
      ]
    })

    await runWasteBalanceDuplicateEventsReport(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Duplicate waste-balance event: registrationId=reg-1 accreditationId=null summaryLogId=log-1 count=3 numbers=[1,2,3]'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste-balance duplicate events report: prnDuplicates=0 summaryLogDuplicates=1'
    })
  })

  it('releases the lock and logs an error when the scan throws', async () => {
    const error = new Error('mongo unavailable')
    vi.mocked(findDuplicateBusinessEvents).mockRejectedValue(error)

    await runWasteBalanceDuplicateEventsReport(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run waste-balance duplicate events report'
    })
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    mockServer.locker.lock.mockRejectedValue(error)

    await runWasteBalanceDuplicateEventsReport(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run waste-balance duplicate events report'
    })
  })
})
