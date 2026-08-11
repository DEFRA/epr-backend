import { beforeEach, describe, expect, it, vi } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { buildExporterRegistration } from '#reports/monitoring/monitoring-test-helpers.js'
import { runOverExportedLoadsReport } from './run-over-exported-loads-report.js'

/**
 * @import { StartedServer } from '#common/hapi-types.js'
 */

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

const receivedRow = (rowId, received, exported) => ({
  rowId,
  wasteRecordType: 'RECEIVED',
  processingType: 'EXPORTER',
  data: {
    DATE_RECEIVED_FOR_EXPORT: '2026-02-11',
    TONNAGE_RECEIVED_FOR_EXPORT: received,
    TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: exported
  }
})

const monthlyReport = (reportId = 'report-1') => ({
  organisationId: 'org-1',
  registrationId: 'reg-1',
  year: 2026,
  reports: {
    monthly: {
      2: {
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        current: {
          id: reportId,
          status: 'submitted',
          exportActivity: { tonnageReceivedNotExported: 0 }
        },
        previousSubmissions: []
      }
    }
  }
})

const emptyEstateApp = () => ({
  reportsRepository: {
    findAllPeriodicReports: vi.fn().mockResolvedValue([]),
    findReportById: vi.fn()
  },
  organisationsRepository: { findRegistrationById: vi.fn() },
  summaryLogRowStatesRepository: { findRowStatesForSummaryLog: vi.fn() }
})

const estateApp = (periodicReports, rowStates) => ({
  reportsRepository: {
    findAllPeriodicReports: vi.fn().mockResolvedValue(periodicReports),
    findReportById: vi.fn().mockImplementation(async (reportId) => ({
      id: reportId,
      source: { summaryLogId: 'log-1' }
    }))
  },
  organisationsRepository: {
    findRegistrationById: vi.fn().mockResolvedValue(buildExporterRegistration())
  },
  summaryLogRowStatesRepository: {
    findRowStatesForSummaryLog: vi.fn().mockResolvedValue(rowStates)
  }
})

const buildServer = (
  app,
  { lock = { free: vi.fn().mockResolvedValue(undefined) }, enabled = true } = {}
) =>
  /** @type {StartedServer} */ (
    /** @type {unknown} */ ({
      app,
      featureFlags: { isOverExportedLoadsReportEnabled: () => enabled },
      locker: { lock: vi.fn().mockResolvedValue(lock) }
    })
  )

const infoLine = (action, message, reference) => ({
  message,
  event: {
    category: 'server',
    action,
    ...(reference ? { reference } : {})
  }
})

describe('runOverExportedLoadsReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not run and touches nothing when the feature flag is off', async () => {
    const app = emptyEstateApp()
    const server = buildServer(app, { enabled: false })

    await runOverExportedLoadsReport(server)

    expect(server.locker.lock).not.toHaveBeenCalled()
    expect(app.reportsRepository.findAllPeriodicReports).not.toHaveBeenCalled()
    expect(logger.info).not.toHaveBeenCalled()
  })

  it('acquires a lock scoped to the report and releases it afterwards', async () => {
    const lock = { free: vi.fn().mockResolvedValue(undefined) }
    const server = buildServer(emptyEstateApp(), { lock })

    await runOverExportedLoadsReport(server)

    expect(server.locker.lock).toHaveBeenCalledWith(
      'over-exported-loads-report'
    )
    expect(lock.free).toHaveBeenCalled()
  })

  it('skips the report and reads nothing when the lock is held by another instance', async () => {
    const app = emptyEstateApp()
    const server = /** @type {StartedServer} */ (
      /** @type {unknown} */ ({
        app,
        featureFlags: { isOverExportedLoadsReportEnabled: () => true },
        locker: { lock: vi.fn().mockResolvedValue(null) }
      })
    )

    await runOverExportedLoadsReport(server)

    expect(app.reportsRepository.findAllPeriodicReports).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      infoLine(
        'lock_acquisition_failed',
        'Unable to obtain lock, skipping over-exported loads report'
      )
    )
  })

  it('logs a summary and no findings when nothing is over-exported', async () => {
    const server = buildServer(emptyEstateApp())

    await runOverExportedLoadsReport(server)

    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      infoLine(
        'over_exported_loads_summary',
        'Over-exported loads: scanned 0, reports 0, loads 0, ' +
          'exporters 0 across 0 organisations, masked 0, unreadable 0, ' +
          'total overshoot 0'
      )
    )
  })

  it('logs a finding for each report carrying over-exported loads', async () => {
    const server = buildServer(
      estateApp([monthlyReport()], [receivedRow('row-1', 10, 12)])
    )

    await runOverExportedLoadsReport(server)

    expect(logger.info).toHaveBeenCalledWith(
      infoLine(
        'over_exported_loads_finding',
        'Over-exported loads: org org-1 / registration reg-1, report report-1 ' +
          '(Feb 2026, submitted) - 1 load(s), overshoot 2 ' +
          '(row-1 received 10 exported 12)',
        'report-1'
      )
    )
    expect(logger.info).toHaveBeenCalledWith(
      infoLine(
        'over_exported_loads_summary',
        'Over-exported loads: scanned 1, reports 1, loads 1, ' +
          'exporters 1 across 1 organisations, masked 0, unreadable 0, ' +
          'total overshoot 2'
      )
    )
  })

  it('warns about a report it could not read, and counts it in the summary', async () => {
    const app = estateApp([monthlyReport()], [receivedRow('row-1', 10, 12)])
    app.reportsRepository.findReportById.mockRejectedValue(
      new Error('Report not found: report-1')
    )
    const server = buildServer(app)

    await runOverExportedLoadsReport(server)

    expect(logger.warn).toHaveBeenCalledWith({
      message:
        'Over-exported loads: could not read report report-1 - Report not found: report-1',
      event: {
        category: 'server',
        action: 'over_exported_loads_unreadable',
        reference: 'report-1'
      }
    })
    expect(logger.info).toHaveBeenCalledWith(
      infoLine(
        'over_exported_loads_summary',
        'Over-exported loads: scanned 1, reports 0, loads 0, ' +
          'exporters 0 across 0 organisations, masked 0, unreadable 1, ' +
          'total overshoot 0'
      )
    )
  })

  it('logs the overshoot broken down by material', async () => {
    const server = buildServer(
      estateApp([monthlyReport()], [receivedRow('row-1', 10, 12)])
    )

    await runOverExportedLoadsReport(server)

    expect(logger.info).toHaveBeenCalledWith(
      infoLine(
        'over_exported_loads_by_material',
        'Over-exported loads by material: plastic - 1 load(s) across ' +
          '1 exporter(s), overshoot 2'
      )
    )
  })

  it('logs the overshoot broken down by the month each report covers', async () => {
    const server = buildServer(
      estateApp([monthlyReport()], [receivedRow('row-1', 10, 12)])
    )

    await runOverExportedLoadsReport(server)

    expect(logger.info).toHaveBeenCalledWith(
      infoLine(
        'over_exported_loads_by_month',
        'Over-exported loads by month: Feb 2026 - 1 report(s), 1 load(s), overshoot 2'
      )
    )
  })

  it('logs the largest overshoots, so one outlier is not read as estate-wide drift', async () => {
    const server = buildServer(
      estateApp(
        [monthlyReport()],
        [receivedRow('row-1', 10, 12), receivedRow('row-2', 1, 20)]
      )
    )

    await runOverExportedLoadsReport(server)

    expect(logger.info).toHaveBeenCalledWith(
      infoLine(
        'over_exported_loads_largest',
        'Over-exported loads largest: row-2 (report-1) 19; row-1 (report-1) 2'
      )
    )
  })

  it('logs no largest line when nothing is over-exported', async () => {
    const server = buildServer(emptyEstateApp())

    await runOverExportedLoadsReport(server)

    expect(logger.info).not.toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          action: 'over_exported_loads_largest'
        })
      })
    )
  })

  it('logs the failure and releases the lock when the scan throws', async () => {
    const lock = { free: vi.fn().mockResolvedValue(undefined) }
    const app = emptyEstateApp()
    app.reportsRepository.findAllPeriodicReports.mockRejectedValue(
      new Error('mongo is down')
    )
    const server = buildServer(app, { lock })

    await runOverExportedLoadsReport(server)

    expect(lock.free).toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith({
      err: expect.any(Error),
      message: 'Failed to run over-exported loads report'
    })
  })
})
