import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { createMongoLedgerRepository } from '#waste-balances/repository/ledger-mongodb.js'
import { createMongoSummaryLogRowStatesRepository } from '#waste-records/repository/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { buildDecemberLoadsReport } from '#december-loads-diagnostic/application/diagnose-december-loads.js'

import { runDecemberLoadsDiagnostic } from './run.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('#waste-balances/repository/ledger-mongodb.js', () => ({
  createMongoLedgerRepository: vi.fn()
}))
vi.mock('#waste-records/repository/mongodb.js', () => ({
  createMongoSummaryLogRowStatesRepository: vi.fn()
}))
vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn()
}))
vi.mock(
  '#december-loads-diagnostic/application/diagnose-december-loads.js',
  () => ({
    buildDecemberLoadsReport: vi.fn()
  })
)

const emptyReport = {
  reports: [],
  summary: {
    scannedAccreditations: 0,
    affectedAccreditations: 0,
    totalDecemberRows: 0
  }
}

describe('runDecemberLoadsDiagnostic', () => {
  /** @type {*} */
  let mockServer
  /** @type {*} */
  let mockLock

  beforeEach(() => {
    vi.clearAllMocks()

    mockLock = { free: vi.fn().mockResolvedValue(undefined) }
    mockServer = {
      db: {},
      locker: { lock: vi.fn().mockResolvedValue(mockLock) }
    }

    vi.mocked(createMongoLedgerRepository).mockResolvedValue(
      () => /** @type {any} */ ({})
    )
    vi.mocked(createMongoSummaryLogRowStatesRepository).mockResolvedValue(
      () => /** @type {any} */ ({})
    )
    vi.mocked(createOrganisationsRepository).mockResolvedValue(
      () => /** @type {any} */ ({})
    )
    vi.mocked(buildDecemberLoadsReport).mockResolvedValue(emptyReport)
  })

  it('acquires a lock scoped to the diagnostic and releases it afterwards', async () => {
    await runDecemberLoadsDiagnostic(mockServer)

    expect(mockServer.locker.lock).toHaveBeenCalledWith(
      'december-loads-diagnostic'
    )
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('skips the run when the lock is held by another instance', async () => {
    mockServer.locker.lock.mockResolvedValue(null)

    await runDecemberLoadsDiagnostic(mockServer)

    expect(createMongoLedgerRepository).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping December loads diagnostic'
    })
  })

  it('logs one candidate line per affected summary log plus the summary', async () => {
    vi.mocked(buildDecemberLoadsReport).mockResolvedValue({
      reports: [
        {
          organisationId: 'org-1',
          organisationReference: '500123',
          accreditationId: 'acc-1',
          accreditationNumber: 'A26ER5000000001PL',
          processingType: 'REPROCESSOR_INPUT',
          decemberKey: '2026-12',
          decemberRowCount: 3
        }
      ],
      summary: {
        scannedAccreditations: 42,
        affectedAccreditations: 1,
        totalDecemberRows: 3
      }
    })

    await runDecemberLoadsDiagnostic(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'December-dated load: organisationId=org-1 organisationReference=500123 accreditationId=acc-1 accreditationNumber=A26ER5000000001PL processingType=REPROCESSOR_INPUT decemberMonth=2026-12 decemberRowCount=3'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'December loads diagnostic: scannedAccreditations=42 affectedAccreditations=1 totalDecemberRows=3'
    })
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('releases the lock and logs an error when the sweep throws', async () => {
    const error = new Error('mongo unavailable')
    vi.mocked(buildDecemberLoadsReport).mockRejectedValue(error)

    await runDecemberLoadsDiagnostic(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run December loads diagnostic'
    })
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    mockServer.locker.lock.mockRejectedValue(error)

    await runDecemberLoadsDiagnostic(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run December loads diagnostic'
    })
  })
})
