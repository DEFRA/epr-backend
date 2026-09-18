import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { config } from '../config.js'

import { createResubmissionPairsQuery } from './repository/resubmission-pairs-query.mongodb.js'
import { diagnoseResubmissionFigures } from './application/diagnose-resubmission-figures.js'
import { runResubmissionFiguresDiagnostic } from './run.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('./repository/resubmission-pairs-query.mongodb.js', () => ({
  createResubmissionPairsQuery: vi.fn()
}))
vi.mock('./application/diagnose-resubmission-figures.js', () => ({
  diagnoseResubmissionFigures: vi.fn()
}))
vi.mock('../config.js', () => ({ config: { get: vi.fn() } }))

const emptyResult = {
  reports: [],
  summary: {
    resubmittedPeriods: 0,
    resubmissionPairs: 0,
    identicalPairs: 0,
    identicalIncludingOrder: 0,
    identicalOnlyAfterReorder: 0,
    changedPairs: 0
  }
}

describe('runResubmissionFiguresDiagnostic', () => {
  /** @type {*} */
  let mockServer
  /** @type {*} */
  let mockLock
  /** @type {*} */
  let mockQuery

  beforeEach(() => {
    vi.clearAllMocks()

    mockLock = { free: vi.fn().mockResolvedValue(undefined) }
    mockServer = {
      db: {},
      locker: { lock: vi.fn().mockResolvedValue(mockLock) }
    }

    mockQuery = vi.fn().mockResolvedValue({ scanned: 0, groups: [] })
    vi.mocked(createResubmissionPairsQuery).mockReturnValue(mockQuery)
    vi.mocked(diagnoseResubmissionFigures).mockReturnValue(emptyResult)

    vi.mocked(config.get).mockReturnValue(true)
  })

  it('does no database work and logs nothing when the feature flag is off', async () => {
    vi.mocked(config.get).mockReturnValue(false)

    await runResubmissionFiguresDiagnostic(mockServer)

    expect(config.get).toHaveBeenCalledWith(
      'featureFlags.resubmissionFiguresDiagnostic'
    )
    expect(mockServer.locker.lock).not.toHaveBeenCalled()
    expect(createResubmissionPairsQuery).not.toHaveBeenCalled()
    expect(logger.info).not.toHaveBeenCalled()
  })

  it('acquires a lock scoped to the diagnostic and releases it afterwards', async () => {
    await runResubmissionFiguresDiagnostic(mockServer)

    expect(mockServer.locker.lock).toHaveBeenCalledWith(
      'report-resubmission-figures-diagnostic'
    )
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('skips the run when the lock is held by another instance', async () => {
    mockServer.locker.lock.mockResolvedValue(null)

    await runResubmissionFiguresDiagnostic(mockServer)

    expect(createResubmissionPairsQuery).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping resubmission figures diagnostic'
    })
  })

  it('logs one line per identical resubmission plus the summary', async () => {
    vi.mocked(diagnoseResubmissionFigures).mockReturnValue({
      reports: [
        {
          organisationId: 'org-1',
          registrationId: 'reg-1',
          year: 2025,
          cadence: 'monthly',
          period: 3,
          fromSubmissionNumber: 1,
          toSubmissionNumber: 2,
          reorderOnly: true
        }
      ],
      summary: {
        resubmittedPeriods: 5,
        resubmissionPairs: 6,
        identicalPairs: 4,
        identicalIncludingOrder: 3,
        identicalOnlyAfterReorder: 1,
        changedPairs: 2
      }
    })
    mockQuery.mockResolvedValue({ scanned: 1234, groups: [{}] })

    await runResubmissionFiguresDiagnostic(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Identical resubmission: organisationId=org-1 registrationId=reg-1 year=2025 cadence=monthly period=3 fromSubmissionNumber=1 toSubmissionNumber=2 reorderOnly=true'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Resubmission figures diagnostic: scannedSubmittedReports=1234 resubmittedPeriods=5 resubmissionPairs=6 identicalPairs=4 identicalIncludingOrder=3 identicalOnlyAfterReorder=1 changedPairs=2'
    })
  })

  it('releases the lock and logs an error when the query throws', async () => {
    const error = new Error('mongo unavailable')
    mockQuery.mockRejectedValue(error)

    await runResubmissionFiguresDiagnostic(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run resubmission figures diagnostic'
    })
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    mockServer.locker.lock.mockRejectedValue(error)

    await runResubmissionFiguresDiagnostic(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run resubmission figures diagnostic'
    })
  })
})
