import { describe, it, expect, vi, beforeEach } from 'vitest'

import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { logger } from '#common/helpers/logging/logger.js'
import { runPreCpaResubmissionReport } from './run-pre-cpa-resubmission-report.js'

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
  summaryLogsRepository: {
    findAllByOrgReg: vi.fn()
  },
  summaryLogRowStatesRepository: {
    findRowStatesForSummaryLog: vi.fn()
  },
  organisationsRepository: {
    findRegistrationById: vi.fn()
  }
})

/**
 * @param {{ id: string, outcome?: string }} params
 */
const rowState = ({ id, outcome = WASTE_BALANCE_OUTCOME.INCLUDED }) => ({
  id,
  rowId: 'row-1',
  processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  data: { DATE_RECEIVED_FOR_REPROCESSING: '2025-06-15' },
  classification: { outcome, reasons: [], transactionAmount: 10 }
})

/**
 * A single registration whose June report was submitted on 1 Jul, then a 1 Aug
 * upload restated the June row — the real finder drives this to one finding.
 * `restatingOutcome: IGNORED` turns it into an invariant-probe hit instead.
 *
 * @param {{ restatingOutcome?: string }} [params]
 */
const oneFindingApp = ({
  restatingOutcome = WASTE_BALANCE_OUTCOME.INCLUDED
} = {}) => ({
  reportsRepository: {
    findAllPeriodicReports: vi.fn().mockResolvedValue([
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2025,
        reports: {
          monthly: {
            6: {
              current: {
                id: 'report-1',
                status: 'submitted',
                submissionNumber: 1,
                submittedAt: '2025-07-01T00:00:00.000Z'
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
  summaryLogsRepository: {
    findAllByOrgReg: vi.fn().mockResolvedValue([
      {
        id: 'sl-original',
        summaryLog: {
          status: 'submitted',
          submittedAt: '2025-06-25T00:00:00.000Z'
        }
      },
      {
        id: 'sl-restating',
        summaryLog: {
          status: 'submitted',
          submittedAt: '2025-08-01T00:00:00.000Z'
        }
      }
    ])
  },
  summaryLogRowStatesRepository: {
    findRowStatesForSummaryLog: vi
      .fn()
      .mockImplementation((_ledger, summaryLogId) =>
        summaryLogId === 'sl-original'
          ? [rowState({ id: 'rs-original' })]
          : [rowState({ id: 'rs-restated', outcome: restatingOutcome })]
      )
  }
})

/**
 * A single submitted June report whose stored submittedAt is missing — a data
 * anomaly the real finder pulls out of sizing and surfaces for review.
 */
const missingSubmittedAtApp = () => ({
  ...emptyEstateApp(),
  reportsRepository: {
    findAllPeriodicReports: vi.fn().mockResolvedValue([
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2025,
        reports: {
          monthly: {
            6: {
              current: {
                id: 'report-1',
                status: 'submitted',
                submissionNumber: 1,
                submittedAt: null
              },
              previousSubmissions: []
            }
          }
        }
      }
    ])
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
    isPreCpaResubmissionReportEnabled: () => reportEnabled
  },
  locker: { lock: vi.fn().mockResolvedValue(lock) }
})

describe('runPreCpaResubmissionReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not run and touches nothing when the feature flag is off', async () => {
    const app = emptyEstateApp()
    const server = buildServer(app, { reportEnabled: false })

    await runPreCpaResubmissionReport(server)

    expect(server.locker.lock).not.toHaveBeenCalled()
    expect(app.reportsRepository.findAllPeriodicReports).not.toHaveBeenCalled()
    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('acquires a lock scoped to the report and releases it afterwards', async () => {
    const lock = { free: vi.fn().mockResolvedValue(undefined) }
    const server = buildServer(emptyEstateApp(), { lock })

    await runPreCpaResubmissionReport(server)

    expect(server.locker.lock).toHaveBeenCalledWith(
      'pre-cpa-resubmission-report'
    )
    expect(lock.free).toHaveBeenCalled()
  })

  it('skips the report and reads nothing when the lock is held by another instance', async () => {
    const app = emptyEstateApp()
    const server = {
      app,
      featureFlags: { isPreCpaResubmissionReportEnabled: () => true },
      locker: { lock: vi.fn().mockResolvedValue(null) }
    }

    await runPreCpaResubmissionReport(server)

    expect(app.reportsRepository.findAllPeriodicReports).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping pre-CPA resubmission report'
    })
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('logs a sizing summary and a clean invariant probe when nothing is affected', async () => {
    const server = buildServer(emptyEstateApp())

    await runPreCpaResubmissionReport(server)

    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Pre-CPA resubmission sizing: scanned 0 submitted reports, 0 would ' +
        'require resubmission, across 0 organisations / 0 registrations. ' +
        'Retrospective — not a prediction of the next upload.'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Invariant check: 0 IGNORED restatements fell in a closed reported period (expected 0)'
    })
  })

  it('logs a retrospective line per affected report and a sizing summary', async () => {
    const server = buildServer(oneFindingApp())

    await runPreCpaResubmissionReport(server)

    expect(logger.info).toHaveBeenCalledWith({
      message: expect.stringContaining(
        'report report-1 (Jun 2025, monthly) — closed period restated by ' +
          'summary log sl-restating'
      )
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Pre-CPA resubmission sizing: scanned 1 submitted reports, 1 would ' +
        'require resubmission, across 1 organisations / 1 registrations. ' +
        'Retrospective — not a prediction of the next upload.'
    })
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('warns with report ids when an IGNORED restatement lands in a closed period', async () => {
    const server = buildServer(
      oneFindingApp({ restatingOutcome: WASTE_BALANCE_OUTCOME.IGNORED })
    )

    await runPreCpaResubmissionReport(server)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Pre-CPA resubmission sizing: scanned 1 submitted reports, 0 would ' +
        'require resubmission, across 0 organisations / 0 registrations. ' +
        'Retrospective — not a prediction of the next upload.'
    })
    expect(logger.warn).toHaveBeenCalledWith({
      message:
        'Invariant check: 1 IGNORED restatements fell in a closed reported ' +
        'period (expected 0) — reports report-1'
    })
  })

  it('warns with report ids when a submitted report is missing its submittedAt', async () => {
    const server = buildServer(missingSubmittedAtApp())

    await runPreCpaResubmissionReport(server)

    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Pre-CPA resubmission sizing: scanned 0 submitted reports, 0 would ' +
        'require resubmission, across 0 organisations / 0 registrations. ' +
        'Retrospective — not a prediction of the next upload.'
    })
    expect(logger.warn).toHaveBeenCalledWith({
      message:
        'Data integrity: 1 submitted reports missing a submittedAt were ' +
        'skipped from sizing — reports report-1'
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

    await runPreCpaResubmissionReport(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run pre-CPA resubmission report'
    })
    expect(lock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    const server = {
      app: emptyEstateApp(),
      featureFlags: { isPreCpaResubmissionReportEnabled: () => true },
      locker: { lock: vi.fn().mockRejectedValue(error) }
    }

    await runPreCpaResubmissionReport(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run pre-CPA resubmission report'
    })
  })
})
