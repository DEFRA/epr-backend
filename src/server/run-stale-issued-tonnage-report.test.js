import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { runStaleIssuedTonnageReport } from './run-stale-issued-tonnage-report.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

const emptyEstateApp = () => ({
  reportsRepository: {
    findAllPeriodicReports: vi.fn().mockResolvedValue([])
  },
  organisationsRepository: {
    findRegistrationById: vi.fn()
  },
  packagingRecyclingNotesRepository: {
    findByAccreditation: vi.fn()
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
    isStaleIssuedTonnageReportEnabled: () => reportEnabled
  },
  locker: { lock: vi.fn().mockResolvedValue(lock) }
})

describe('runStaleIssuedTonnageReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not run and touches nothing when the feature flag is off', async () => {
    const app = emptyEstateApp()
    const server = buildServer(app, { reportEnabled: false })

    await runStaleIssuedTonnageReport(server)

    expect(server.locker.lock).not.toHaveBeenCalled()
    expect(app.reportsRepository.findAllPeriodicReports).not.toHaveBeenCalled()
    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('acquires a lock scoped to the report and releases it afterwards', async () => {
    const lock = { free: vi.fn().mockResolvedValue(undefined) }
    const server = buildServer(emptyEstateApp(), { lock })

    await runStaleIssuedTonnageReport(server)

    expect(server.locker.lock).toHaveBeenCalledWith(
      'stale-issued-tonnage-report'
    )
    expect(lock.free).toHaveBeenCalled()
  })

  it('skips the report and reads nothing when the lock is held by another instance', async () => {
    const app = emptyEstateApp()
    const server = {
      app,
      featureFlags: { isStaleIssuedTonnageReportEnabled: () => true },
      locker: { lock: vi.fn().mockResolvedValue(null) }
    }

    await runStaleIssuedTonnageReport(server)

    expect(app.reportsRepository.findAllPeriodicReports).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping stale issued tonnage report'
    })
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('logs a summary line and no warnings when nothing is stale', async () => {
    const server = buildServer(emptyEstateApp())

    await runStaleIssuedTonnageReport(server)

    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Stale issued tonnage report: scanned 0, discrepancies 0, affected organisations 0'
    })
  })

  it('logs a warning finding for each stale report', async () => {
    const app = {
      reportsRepository: {
        findAllPeriodicReports: vi.fn().mockResolvedValue([
          {
            organisationId: 'org-1',
            registrationId: 'reg-1',
            year: 2025,
            reports: {
              monthly: {
                6: {
                  startDate: '2025-06-01T00:00:00.000Z',
                  endDate: '2025-06-30T23:59:59.999Z',
                  dueDate: '2025-07-15T00:00:00.000Z',
                  current: {
                    id: 'report-1',
                    status: 'submitted',
                    prn: { issuedTonnage: 50 }
                  },
                  previousSubmissions: []
                }
              }
            }
          }
        ])
      },
      organisationsRepository: {
        findRegistrationById: vi
          .fn()
          .mockResolvedValue({ accreditationId: 'acc-1' })
      },
      packagingRecyclingNotesRepository: {
        findByAccreditation: vi.fn().mockResolvedValue([])
      }
    }
    const server = buildServer(app)

    await runStaleIssuedTonnageReport(server)

    expect(logger.warn).toHaveBeenCalledWith({
      message: expect.stringContaining(
        'org org-1 / registration reg-1, report report-1'
      )
    })
    expect(logger.warn).toHaveBeenCalledWith({
      message: expect.stringContaining('stored 50, recalculated 0')
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Stale issued tonnage report: scanned 1, discrepancies 1, affected organisations 1'
    })
  })

  it('counts distinct affected organisations, not discrepancy count, when one org has multiple stale reports', async () => {
    const monthlyReport = (
      period,
      reportId,
      organisationId,
      registrationId
    ) => ({
      organisationId,
      registrationId,
      year: 2025,
      reports: {
        monthly: {
          [period]: {
            startDate: `2025-0${period}-01T00:00:00.000Z`,
            endDate: `2025-0${period}-28T23:59:59.999Z`,
            dueDate: `2025-0${period + 1}-15T00:00:00.000Z`,
            current: {
              id: reportId,
              status: 'submitted',
              prn: { issuedTonnage: 50 }
            },
            previousSubmissions: []
          }
        }
      }
    })

    const app = {
      reportsRepository: {
        findAllPeriodicReports: vi
          .fn()
          .mockResolvedValue([
            monthlyReport(6, 'report-1', 'org-1', 'reg-1'),
            monthlyReport(7, 'report-2', 'org-1', 'reg-1'),
            monthlyReport(6, 'report-3', 'org-2', 'reg-2')
          ])
      },
      organisationsRepository: {
        findRegistrationById: vi
          .fn()
          .mockResolvedValue({ accreditationId: 'acc-1' })
      },
      packagingRecyclingNotesRepository: {
        findByAccreditation: vi.fn().mockResolvedValue([])
      }
    }
    const server = buildServer(app)

    await runStaleIssuedTonnageReport(server)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Stale issued tonnage report: scanned 3, discrepancies 3, affected organisations 2'
    })
  })

  it('releases the lock and logs an error when the run itself throws', async () => {
    const error = new Error('mongo unavailable')
    const lock = { free: vi.fn().mockResolvedValue(undefined) }
    const app = {
      ...emptyEstateApp(),
      reportsRepository: {
        findAllPeriodicReports: vi.fn().mockRejectedValue(error)
      }
    }
    const server = buildServer(app, { lock })

    await runStaleIssuedTonnageReport(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run stale issued tonnage report'
    })
    expect(lock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    const server = {
      app: emptyEstateApp(),
      featureFlags: { isStaleIssuedTonnageReportEnabled: () => true },
      locker: { lock: vi.fn().mockRejectedValue(error) }
    }

    await runStaleIssuedTonnageReport(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run stale issued tonnage report'
    })
  })
})
