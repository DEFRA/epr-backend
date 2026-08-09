import { beforeEach, describe, expect, it, vi } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { runUnexportedTonnageReport } from './run-unexported-tonnage-report.js'

/**
 * @import { StartedServer } from '#common/hapi-types.js'
 */

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}))

const submittedMonthlyReport = ({
  organisationId = 'org-1',
  registrationId = 'reg-1',
  reportId = 'report-1',
  period = 2,
  startDate = '2026-02-01',
  endDate = '2026-02-28',
  tonnageReceivedNotExported = 0
} = {}) => ({
  organisationId,
  registrationId,
  year: 2026,
  reports: {
    monthly: {
      [period]: {
        startDate,
        endDate,
        current: {
          id: reportId,
          status: 'submitted',
          exportActivity: { tonnageReceivedNotExported }
        },
        previousSubmissions: []
      }
    }
  }
})

const submittedFebReport = (overrides = {}) => submittedMonthlyReport(overrides)

const submittedMarchReport = (overrides = {}) =>
  submittedMonthlyReport({
    period: 3,
    startDate: '2026-03-01',
    endDate: '2026-03-31',
    ...overrides
  })

const receivedRow = (tonnageReceived, dateReceived = '2026-02-11') => ({
  rowId: `row-${dateReceived}`,
  wasteRecordType: 'RECEIVED',
  processingType: 'EXPORTER',
  data: {
    DATE_RECEIVED_FOR_EXPORT: dateReceived,
    TONNAGE_RECEIVED_FOR_EXPORT: tonnageReceived,
    TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: null
  }
})

const partlyExportedRow = (tonnageReceived, tonnageExported) => ({
  ...receivedRow(tonnageReceived),
  data: {
    ...receivedRow(tonnageReceived).data,
    TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: tonnageExported
  }
})

const emptyEstateApp = () => ({
  reportsRepository: {
    findAllPeriodicReports: vi.fn().mockResolvedValue([]),
    findReportById: vi.fn()
  },
  organisationsRepository: {
    findRegistrationById: vi.fn()
  },
  summaryLogRowStatesRepository: {
    findRowStatesForSummaryLog: vi.fn()
  }
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
    findRegistrationById: vi.fn().mockResolvedValue({ accreditationId: null })
  },
  summaryLogRowStatesRepository: {
    findRowStatesForSummaryLog: vi.fn().mockResolvedValue(rowStates)
  }
})

const buildServer = (
  app,
  {
    lock = { free: vi.fn().mockResolvedValue(undefined) },
    reportEnabled = true
  } = {}
) =>
  /** @type {StartedServer} */ (
    /** @type {unknown} */ ({
      app,
      featureFlags: {
        isUnexportedTonnageReportEnabled: () => reportEnabled
      },
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

describe('runUnexportedTonnageReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not run and touches nothing when the feature flag is off', async () => {
    const app = emptyEstateApp()
    const server = buildServer(app, { reportEnabled: false })

    await runUnexportedTonnageReport(server)

    expect(server.locker.lock).not.toHaveBeenCalled()
    expect(app.reportsRepository.findAllPeriodicReports).not.toHaveBeenCalled()
    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('acquires a lock scoped to the report and releases it afterwards', async () => {
    const lock = { free: vi.fn().mockResolvedValue(undefined) }
    const server = buildServer(emptyEstateApp(), { lock })

    await runUnexportedTonnageReport(server)

    expect(server.locker.lock).toHaveBeenCalledWith('unexported-tonnage-report')
    expect(lock.free).toHaveBeenCalled()
  })

  it('skips the report and reads nothing when the lock is held by another instance', async () => {
    const app = emptyEstateApp()
    const server = /** @type {StartedServer} */ (
      /** @type {unknown} */ ({
        app,
        featureFlags: { isUnexportedTonnageReportEnabled: () => true },
        locker: { lock: vi.fn().mockResolvedValue(null) }
      })
    )

    await runUnexportedTonnageReport(server)

    expect(app.reportsRepository.findAllPeriodicReports).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      infoLine(
        'lock_acquisition_failed',
        'Unable to obtain lock, skipping unexported tonnage report'
      )
    )
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('logs a summary line and no findings when nothing is wrong', async () => {
    const server = buildServer(emptyEstateApp())

    await runUnexportedTonnageReport(server)

    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      infoLine(
        'unexported_tonnage_summary',
        'Unexported tonnage: scanned 0, mismatches 0, source-missing 0, ' +
          'recompute-failed 0, lookup-failed 0, affected exporters 0 across 0 organisations, ' +
          'unresolved exporters 0, ' +
          'rows 0 in period / 0 miscounted / 0 unexported / 0 over-exported / 0 missing received, ' +
          'total delta 0 (understated 0, overstated 0)'
      )
    )
  })

  it('logs an info finding for each report the fix would change', async () => {
    const server = buildServer(
      estateApp([submittedFebReport()], [receivedRow(29.19)])
    )

    await runUnexportedTonnageReport(server)

    expect(logger.info).toHaveBeenCalledWith(
      infoLine(
        'unexported_tonnage_mismatch',
        'Unexported tonnage mismatch: org org-1 / registration reg-1, ' +
          'report report-1 (Feb 2026, submitted) - stored 0, recomputed 29.19, ' +
          'delta 29.19, rows 1 in period / 0 miscounted / 1 unexported / 0 over-exported / 0 missing received',
        'report-1'
      )
    )
    expect(logger.info).toHaveBeenCalledWith(
      infoLine(
        'unexported_tonnage_summary',
        'Unexported tonnage: scanned 1, mismatches 1, source-missing 0, ' +
          'recompute-failed 0, lookup-failed 0, affected exporters 1 across 1 organisations, ' +
          'unresolved exporters 0, ' +
          'rows 1 in period / 0 miscounted / 1 unexported / 0 over-exported / 0 missing received, ' +
          'total delta 29.19 (understated 29.19, overstated 0)'
      )
    )
  })

  it('counts the rows the live rule scored differently from the corrected one', async () => {
    const server = buildServer(
      estateApp([submittedFebReport()], [partlyExportedRow(10, 6)])
    )

    await runUnexportedTonnageReport(server)

    expect(logger.info).toHaveBeenCalledWith(
      infoLine(
        'unexported_tonnage_summary',
        'Unexported tonnage: scanned 1, mismatches 1, source-missing 0, ' +
          'recompute-failed 0, lookup-failed 0, affected exporters 1 across 1 organisations, ' +
          'unresolved exporters 0, ' +
          'rows 1 in period / 1 miscounted / 1 unexported / 0 over-exported / 0 missing received, ' +
          'total delta 4 (understated 4, overstated 0)'
      )
    )
  })

  const estateWithNoSourceSummaryLog = () => {
    const app = estateApp([submittedFebReport()], [receivedRow(10)])
    app.reportsRepository.findReportById.mockResolvedValue({
      id: 'report-1',
      source: { summaryLogId: null }
    })
    return app
  }

  const estateWithUnreadableTonnage = () =>
    estateApp([submittedFebReport()], [receivedRow(1.234)])

  const estateWithADeletedReport = () => {
    const app = estateApp([submittedFebReport()], [receivedRow(10)])
    app.reportsRepository.findReportById.mockRejectedValue(
      new Error('Report not found: report-1')
    )
    return app
  }

  it.each([
    [
      'source-missing',
      'unexported_tonnage_source_missing',
      estateWithNoSourceSummaryLog
    ],
    [
      'recompute-failed',
      'unexported_tonnage_recompute_failed',
      estateWithUnreadableTonnage
    ],
    [
      'lookup-failed',
      'unexported_tonnage_lookup_failed',
      estateWithADeletedReport
    ]
  ])(
    'tags a %s finding with its own action, so one kind can be read apart from the others',
    async (_kind, action, buildApp) => {
      const server = buildServer(buildApp())

      await runUnexportedTonnageReport(server)

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: { category: 'server', action, reference: 'report-1' }
        })
      )
    }
  )

  it('logs the delta broken down by the month each report covers', async () => {
    const server = buildServer(
      estateApp(
        [submittedFebReport(), submittedMarchReport({ reportId: 'report-2' })],
        [receivedRow(29.19), receivedRow(4, '2026-03-09')]
      )
    )

    await runUnexportedTonnageReport(server)

    expect(logger.info).toHaveBeenCalledWith(
      infoLine(
        'unexported_tonnage_by_month',
        'Unexported tonnage by month: Feb 2026 - 1 report(s), delta 29.19, ' +
          'understated 29.19, overstated 0'
      )
    )
    expect(logger.info).toHaveBeenCalledWith(
      infoLine(
        'unexported_tonnage_by_month',
        'Unexported tonnage by month: Mar 2026 - 1 report(s), delta 4, ' +
          'understated 4, overstated 0'
      )
    )
  })

  it('logs the mismatches split by report status, separating resubmissions from drafts', async () => {
    const server = buildServer(
      estateApp([submittedFebReport()], [receivedRow(29.19)])
    )

    await runUnexportedTonnageReport(server)

    expect(logger.info).toHaveBeenCalledWith(
      infoLine(
        'unexported_tonnage_by_status',
        'Unexported tonnage by status: submitted 1, in_progress 0, ' +
          'ready_to_submit 0'
      )
    )
  })

  it('logs the largest corrections, so one outlier is not read as estate-wide drift', async () => {
    const server = buildServer(
      estateApp(
        [submittedFebReport(), submittedMarchReport({ reportId: 'report-2' })],
        [receivedRow(29.19), receivedRow(4, '2026-03-09')]
      )
    )

    await runUnexportedTonnageReport(server)

    expect(logger.info).toHaveBeenCalledWith(
      infoLine(
        'unexported_tonnage_largest_deltas',
        'Unexported tonnage largest deltas: report-1 (Feb 2026) 29.19; ' +
          'report-2 (Mar 2026) 4'
      )
    )
  })

  it('logs no largest-deltas line when nothing is wrong', async () => {
    const server = buildServer(emptyEstateApp())

    await runUnexportedTonnageReport(server)

    expect(logger.info).not.toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          action: 'unexported_tonnage_largest_deltas'
        })
      })
    )
  })

  it('counts distinct affected exporters and organisations, and totals the delta across them', async () => {
    const server = buildServer(
      estateApp(
        [
          submittedFebReport(),
          submittedFebReport({ reportId: 'report-2' }),
          submittedFebReport({
            organisationId: 'org-2',
            registrationId: 'reg-2',
            reportId: 'report-3'
          })
        ],
        [receivedRow(10)]
      )
    )

    await runUnexportedTonnageReport(server)

    expect(logger.info).toHaveBeenCalledWith(
      infoLine(
        'unexported_tonnage_summary',
        'Unexported tonnage: scanned 3, mismatches 3, source-missing 0, ' +
          'recompute-failed 0, lookup-failed 0, affected exporters 2 across 2 organisations, ' +
          'unresolved exporters 0, ' +
          'rows 3 in period / 0 miscounted / 3 unexported / 0 over-exported / 0 missing received, ' +
          'total delta 30 (understated 30, overstated 0)'
      )
    )
  })

  it('still logs a summary when one report cannot be read, rather than losing the run', async () => {
    const app = estateApp(
      [
        submittedFebReport(),
        submittedFebReport({
          organisationId: 'org-2',
          registrationId: 'reg-2',
          reportId: 'report-2'
        })
      ],
      [receivedRow(29.19)]
    )
    app.reportsRepository.findReportById.mockRejectedValueOnce(
      new Error('Report not found: report-1')
    )
    const server = buildServer(app)

    await runUnexportedTonnageReport(server)

    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      infoLine(
        'unexported_tonnage_summary',
        'Unexported tonnage: scanned 2, mismatches 1, source-missing 0, ' +
          'recompute-failed 0, lookup-failed 1, ' +
          'affected exporters 1 across 1 organisations, ' +
          'unresolved exporters 1, ' +
          'rows 1 in period / 0 miscounted / 1 unexported / 0 over-exported / 0 missing received, ' +
          'total delta 29.19 (understated 29.19, overstated 0)'
      )
    )
  })

  it('logs the failure and releases the lock when the scan throws', async () => {
    const lock = { free: vi.fn().mockResolvedValue(undefined) }
    const app = emptyEstateApp()
    app.reportsRepository.findAllPeriodicReports.mockRejectedValue(
      new Error('mongo is down')
    )
    const server = buildServer(app, { lock })

    await runUnexportedTonnageReport(server)

    expect(lock.free).toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith({
      err: expect.any(Error),
      message: 'Failed to run unexported tonnage report'
    })
  })
})
