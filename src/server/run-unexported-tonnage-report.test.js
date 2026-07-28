import { beforeEach, describe, expect, it, vi } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { runUnexportedTonnageReport } from './run-unexported-tonnage-report.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

const submittedFebReport = ({
  organisationId = 'org-1',
  registrationId = 'reg-1',
  reportId = 'report-1',
  tonnageReceivedNotExported = 0
} = {}) => ({
  organisationId,
  registrationId,
  year: 2026,
  reports: {
    monthly: {
      2: {
        startDate: '2026-02-01',
        endDate: '2026-02-28',
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

const receivedRow = (tonnageReceived) => ({
  rowId: 'row-1',
  wasteRecordType: 'RECEIVED',
  processingType: 'EXPORTER',
  data: {
    DATE_RECEIVED_FOR_EXPORT: '2026-02-11',
    TONNAGE_RECEIVED_FOR_EXPORT: tonnageReceived,
    TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: null
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
  summaryLogRowStateRepository: {
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
  summaryLogRowStateRepository: {
    findRowStatesForSummaryLog: vi.fn().mockResolvedValue(rowStates)
  }
})

const buildServer = (
  app,
  {
    lock = { free: vi.fn().mockResolvedValue(undefined) },
    reportEnabled = true
  } = {}
) => ({
  app,
  featureFlags: {
    isUnexportedTonnageReportEnabled: () => reportEnabled
  },
  locker: { lock: vi.fn().mockResolvedValue(lock) }
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
    const server = {
      app,
      featureFlags: { isUnexportedTonnageReportEnabled: () => true },
      locker: { lock: vi.fn().mockResolvedValue(null) }
    }

    await runUnexportedTonnageReport(server)

    expect(app.reportsRepository.findAllPeriodicReports).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping unexported tonnage report'
    })
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('logs a summary line and no findings when nothing is wrong', async () => {
    const server = buildServer(emptyEstateApp())

    await runUnexportedTonnageReport(server)

    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Unexported tonnage: scanned 0, mismatches 0, source-missing 0, ' +
        'recompute-failed 0, affected organisations 0, total delta 0'
    })
  })

  it('logs an info finding for each report the fix would change', async () => {
    const server = buildServer(
      estateApp([submittedFebReport()], [receivedRow(29.19)])
    )

    await runUnexportedTonnageReport(server)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Unexported tonnage mismatch: org org-1 / registration reg-1, ' +
        'report report-1 (Feb 2026, submitted) - stored 0, recomputed 29.19, delta 29.19'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Unexported tonnage: scanned 1, mismatches 1, source-missing 0, ' +
        'recompute-failed 0, affected organisations 1, total delta 29.19'
    })
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('counts distinct affected organisations and totals the delta across them', async () => {
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

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Unexported tonnage: scanned 3, mismatches 3, source-missing 0, ' +
        'recompute-failed 0, affected organisations 2, total delta 30'
    })
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
