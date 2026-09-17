import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { createMongoLedgerRepository } from '#waste-balances/repository/ledger-mongodb.js'
import { createMongoSummaryLogRowStatesRepository } from '#waste-records/repository/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import {
  findReportDataCompletenessFindings,
  formatFinding,
  summariseByTemplate,
  formatTemplateBreakdown,
  summariseByMaterial,
  formatMaterialBreakdown,
  formatFieldBreakdown,
  formatTotals,
  formatUnresolved
} from '#reports/monitoring/report-data-completeness-diagnostic.js'
import { config } from '../config.js'

import { runReportDataCompletenessDiagnostic } from './run-report-data-completeness-diagnostic.js'

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
vi.mock('#reports/monitoring/report-data-completeness-diagnostic.js', () => ({
  findReportDataCompletenessFindings: vi.fn(),
  formatFinding: vi.fn(),
  summariseByTemplate: vi.fn(),
  formatTemplateBreakdown: vi.fn(),
  summariseByMaterial: vi.fn(),
  formatMaterialBreakdown: vi.fn(),
  formatFieldBreakdown: vi.fn(),
  formatTotals: vi.fn(),
  formatUnresolved: vi.fn()
}))
vi.mock('../config.js', () => ({ config: { get: vi.fn() } }))

const emptyResult = {
  scanned: 0,
  findings: [],
  unresolved: [],
  missingFieldCounts: []
}

describe('runReportDataCompletenessDiagnostic', () => {
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
      () => /** @type {*} */ ({})
    )
    vi.mocked(createMongoSummaryLogRowStatesRepository).mockResolvedValue(
      () => /** @type {*} */ ({})
    )
    vi.mocked(createOrganisationsRepository).mockResolvedValue(
      () => /** @type {*} */ ({})
    )

    vi.mocked(findReportDataCompletenessFindings).mockResolvedValue(emptyResult)
    vi.mocked(config.get).mockReturnValue(true)
  })

  it('does no database work and logs nothing when the feature flag is off', async () => {
    vi.mocked(config.get).mockReturnValue(false)

    await runReportDataCompletenessDiagnostic(mockServer)

    expect(config.get).toHaveBeenCalledWith(
      'featureFlags.reportDataCompleteDiagnostic'
    )
    expect(mockServer.locker.lock).not.toHaveBeenCalled()
    expect(createMongoLedgerRepository).not.toHaveBeenCalled()
    expect(logger.info).not.toHaveBeenCalled()
  })

  it('acquires a lock scoped to the diagnostic and releases it afterwards', async () => {
    await runReportDataCompletenessDiagnostic(mockServer)

    expect(mockServer.locker.lock).toHaveBeenCalledWith(
      'report-data-complete-diagnostic'
    )
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('logs and skips when the lock cannot be obtained', async () => {
    mockServer.locker.lock.mockResolvedValue(null)

    await runReportDataCompletenessDiagnostic(mockServer)

    expect(createMongoLedgerRepository).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Unable to obtain lock, skipping report-data completeness diagnostic'
    })
  })

  it('logs one line per finding, the four rollups, and warns for unresolved registrations', async () => {
    const finding = /** @type {*} */ ({ summaryLogId: 'sl-a' })
    const unresolved = /** @type {*} */ ({ summaryLogId: 'sl-d' })
    vi.mocked(findReportDataCompletenessFindings).mockResolvedValue({
      scanned: 2,
      findings: [finding],
      unresolved: [unresolved],
      missingFieldCounts: [{ field: 'OSR_ID', count: 1 }]
    })
    vi.mocked(formatFinding).mockReturnValue('finding line')
    vi.mocked(formatTemplateBreakdown).mockReturnValue('template line')
    vi.mocked(formatMaterialBreakdown).mockReturnValue('material line')
    vi.mocked(formatFieldBreakdown).mockReturnValue('field line')
    vi.mocked(formatTotals).mockReturnValue('totals line')
    vi.mocked(formatUnresolved).mockReturnValue('unresolved line')

    await runReportDataCompletenessDiagnostic(mockServer)

    expect(formatFinding).toHaveBeenCalledWith(finding)
    expect(summariseByTemplate).toHaveBeenCalledWith([finding])
    expect(summariseByMaterial).toHaveBeenCalledWith([finding])
    expect(formatFieldBreakdown).toHaveBeenCalledWith([
      { field: 'OSR_ID', count: 1 }
    ])
    expect(formatTotals).toHaveBeenCalledWith({
      scanned: 2,
      findings: [finding]
    })
    expect(formatUnresolved).toHaveBeenCalledWith(unresolved)

    for (const message of [
      'finding line',
      'template line',
      'material line',
      'field line',
      'totals line'
    ]) {
      expect(logger.info).toHaveBeenCalledWith({ message })
    }
    expect(logger.warn).toHaveBeenCalledWith({ message: 'unresolved line' })
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('releases the lock and logs an error when the scan throws', async () => {
    const error = new Error('mongo unavailable')
    vi.mocked(findReportDataCompletenessFindings).mockRejectedValue(error)

    await runReportDataCompletenessDiagnostic(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run report-data completeness diagnostic'
    })
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    mockServer.locker.lock.mockRejectedValue(error)

    await runReportDataCompletenessDiagnostic(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run report-data completeness diagnostic'
    })
  })
})
