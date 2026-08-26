import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { findDuplicateBusinessEvents } from '#waste-balances/monitoring/duplicate-business-events.js'

import { runWasteBalanceDuplicateEventsReport } from './run-waste-balance-duplicate-events-report.js'

/** @import { DuplicateGroup } from '#waste-balances/monitoring/duplicate-business-events.js' */

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
 * @param {{ prn?: DuplicateGroup[], summaryLog?: DuplicateGroup[] }} [findings]
 */
const seedFindings = ({ prn = [], summaryLog = [] } = {}) => {
  vi.mocked(findDuplicateBusinessEvents).mockResolvedValue({ prn, summaryLog })
}

describe('runWasteBalanceDuplicateEventsReport', () => {
  /** @type {*} */
  let mockServer
  /** @type {*} */
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

  it('logs a zero-duplicate summary for a clean ledger', async () => {
    seedFindings()

    await runWasteBalanceDuplicateEventsReport(mockServer)

    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
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
            kind: 'prn-cancelled-after-issue'
          },
          count: 2,
          entries: [
            { number: 4, createdAt: new Date('2026-01-15T10:00:00.000Z') },
            { number: 5, createdAt: new Date('2026-01-15T10:00:00.050Z') }
          ],
          organisationIds: ['org-1']
        }
      ]
    })

    await runWasteBalanceDuplicateEventsReport(mockServer)

    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Duplicate waste-balance event: registrationId=reg-1 accreditationId=acc-1 prnId=prn-1 kind=prn-cancelled-after-issue organisationIds=[org-1] count=2 slots=[4@2026-01-15T10:00:00.000Z,5@2026-01-15T10:00:00.050Z]'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste-balance duplicate events report: prnDuplicates=1 summaryLogDuplicates=0'
    })
  })

  it('logs a summary-log duplicate finding for a registered-only (null accreditation) ledger', async () => {
    seedFindings({
      summaryLog: [
        {
          _id: {
            registrationId: 'reg-1',
            accreditationId: null,
            summaryLogId: 'log-1'
          },
          count: 3,
          entries: [
            { number: 1, createdAt: new Date('2026-01-15T10:00:00.000Z') },
            { number: 2, createdAt: new Date('2026-01-15T10:00:00.020Z') },
            { number: 3, createdAt: new Date('2026-01-15T10:00:00.040Z') }
          ],
          organisationIds: ['org-1']
        }
      ]
    })

    await runWasteBalanceDuplicateEventsReport(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Duplicate waste-balance event: registrationId=reg-1 accreditationId=null summaryLogId=log-1 organisationIds=[org-1] count=3 slots=[1@2026-01-15T10:00:00.000Z,2@2026-01-15T10:00:00.020Z,3@2026-01-15T10:00:00.040Z]'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste-balance duplicate events report: prnDuplicates=0 summaryLogDuplicates=1'
    })
  })

  it('names every organisation, and reports an event with no write time as unknown', async () => {
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
          entries: [
            { number: 1 },
            { number: 2, createdAt: new Date('2026-01-15T10:00:00.050Z') }
          ],
          organisationIds: ['org-1', 'org-2']
        }
      ]
    })

    await runWasteBalanceDuplicateEventsReport(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Duplicate waste-balance event: registrationId=reg-1 accreditationId=acc-1 prnId=prn-1 kind=prn-created organisationIds=[org-1,org-2] count=2 slots=[1@unknown,2@2026-01-15T10:00:00.050Z]'
    })
  })

  it('reports an unparseable write time as unknown rather than failing the run', async () => {
    seedFindings({
      prn: [
        {
          _id: { registrationId: 'reg-1', kind: 'prn-created' },
          count: 2,
          entries: [
            { number: 1, createdAt: /** @type {*} */ ('not-a-date') },
            { number: 2, createdAt: new Date('2026-01-15T10:00:00.050Z') }
          ],
          organisationIds: ['org-1']
        }
      ]
    })

    await runWasteBalanceDuplicateEventsReport(mockServer)

    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Duplicate waste-balance event: registrationId=reg-1 kind=prn-created organisationIds=[org-1] count=2 slots=[1@unknown,2@2026-01-15T10:00:00.050Z]'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste-balance duplicate events report: prnDuplicates=1 summaryLogDuplicates=0'
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
