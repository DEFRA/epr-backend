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
    accreditationsWithDecember: 0,
    mismatchedAccreditations: 0
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

  it('logs one mismatch line per flagged accreditation plus the summary', async () => {
    vi.mocked(buildDecemberLoadsReport).mockResolvedValue({
      reports: [
        {
          organisationId: 'org-1',
          organisationReference: '500123',
          accreditationId: 'acc-1',
          accreditationNumber: 'A26ER5000000001PL',
          processingType: 'REPROCESSOR_INPUT',
          decemberKey: '2026-12',
          summaryLogDecemberTonnage: 30,
          ledgerDecemberBalance: 12
        }
      ],
      summary: {
        scannedAccreditations: 42,
        accreditationsWithDecember: 5,
        mismatchedAccreditations: 1
      }
    })

    await runDecemberLoadsDiagnostic(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'December balance mismatch: organisationId=org-1 organisationReference=500123 accreditationId=acc-1 accreditationNumber=A26ER5000000001PL processingType=REPROCESSOR_INPUT decemberMonth=2026-12 summaryLogDecemberTonnage=30 ledgerDecemberBalance=12'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'December loads diagnostic: scannedAccreditations=42 accreditationsWithDecember=5 mismatchedAccreditations=1'
    })
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('renders an absent ledger December portion as absent', async () => {
    vi.mocked(buildDecemberLoadsReport).mockResolvedValue({
      reports: [
        {
          organisationId: 'org-2',
          organisationReference: '500124',
          accreditationId: 'acc-2',
          accreditationNumber: 'A26ER5000000002PL',
          processingType: 'EXPORTER',
          decemberKey: '2026-12',
          summaryLogDecemberTonnage: 20,
          ledgerDecemberBalance: null
        }
      ],
      summary: {
        scannedAccreditations: 1,
        accreditationsWithDecember: 1,
        mismatchedAccreditations: 1
      }
    })

    await runDecemberLoadsDiagnostic(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'December balance mismatch: organisationId=org-2 organisationReference=500124 accreditationId=acc-2 accreditationNumber=A26ER5000000002PL processingType=EXPORTER decemberMonth=2026-12 summaryLogDecemberTonnage=20 ledgerDecemberBalance=absent'
    })
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
