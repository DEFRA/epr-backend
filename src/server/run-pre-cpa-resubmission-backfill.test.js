import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { logger } from '#common/helpers/logging/logger.js'
import { config } from '#root/config.js'
import { runPreCpaResubmissionBackfill } from './run-pre-cpa-resubmission-backfill.js'

const CLOSED_PERIOD_ADJUSTMENTS = 'featureFlags.closedPeriodAdjustments'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

const emptyEstateApp = () => ({
  reportsRepository: {
    findAllPeriodicReports: vi.fn().mockResolvedValue([]),
    markSubmittedReportsRequiringResubmission: vi.fn().mockResolvedValue([])
  },
  summaryLogsRepository: {
    findAllByOrgReg: vi.fn()
  },
  summaryLogRowStatesRepository: {
    findRowStatesForSummaryLog: vi.fn()
  },
  organisationsRepository: {
    findRegistrationById: vi.fn()
  },
  systemLogsRepository: {
    insert: vi.fn().mockResolvedValue(undefined),
    insertMany: vi.fn().mockResolvedValue(undefined)
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
 * upload restated the June row -- the real finder drives this to one finding.
 * `restatingOutcome: IGNORED` turns it into an invariant-probe hit instead.
 *
 * @param {{ restatingOutcome?: string }} [params]
 */
const oneFindingApp = ({
  restatingOutcome = WASTE_BALANCE_OUTCOME.INCLUDED
} = {}) => ({
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
                submittedAt: '2025-07-01T00:00:00.000Z',
                resubmissionRequired: null
              },
              previousSubmissions: []
            }
          }
        }
      }
    ]),
    markSubmittedReportsRequiringResubmission: vi.fn().mockResolvedValue([])
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
          submittedAt: '2025-06-25T00:00:00.000Z',
          file: { id: 'sl-original' }
        }
      },
      {
        id: 'sl-restating',
        summaryLog: {
          status: 'submitted',
          submittedAt: '2025-08-01T00:00:00.000Z',
          file: { id: 'sl-restating' }
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
 * A single submitted June report whose stored submittedAt is missing -- a data
 * anomaly the real finder pulls out of sizing and surfaces for review.
 */
const missingSubmittedAtApp = () => ({
  ...emptyEstateApp(),
  reportsRepository: {
    ...emptyEstateApp().reportsRepository,
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
                submittedAt: null,
                resubmissionRequired: null
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
    reportEnabled = true,
    backfillEnabled = false
  } = {}
) => ({
  app,
  featureFlags: {
    isPreCpaResubmissionReportEnabled: () => reportEnabled,
    isPreCpaResubmissionBackfillEnabled: () => backfillEnabled
  },
  locker: { lock: vi.fn().mockResolvedValue(lock) }
})

describe('runPreCpaResubmissionBackfill', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    config.set(CLOSED_PERIOD_ADJUSTMENTS, false)
  })

  afterEach(() => {
    config.set(CLOSED_PERIOD_ADJUSTMENTS, false)
  })

  describe('diagnostic step (preCpaResubmissionReport)', () => {
    it('does not run and touches nothing when both flags are off', async () => {
      const app = emptyEstateApp()
      const server = buildServer(app, {
        reportEnabled: false,
        backfillEnabled: false
      })

      await runPreCpaResubmissionBackfill(server)

      expect(server.locker.lock).not.toHaveBeenCalled()
      expect(
        app.reportsRepository.findAllPeriodicReports
      ).not.toHaveBeenCalled()
      expect(logger.info).not.toHaveBeenCalled()
      expect(logger.warn).not.toHaveBeenCalled()
      expect(logger.error).not.toHaveBeenCalled()
    })

    it('acquires the shared lock and releases it afterwards', async () => {
      const lock = { free: vi.fn().mockResolvedValue(undefined) }
      const server = buildServer(emptyEstateApp(), { lock })

      await runPreCpaResubmissionBackfill(server)

      expect(server.locker.lock).toHaveBeenCalledWith('pre-cpa-resubmission')
      expect(server.locker.lock).toHaveBeenCalledTimes(1)
      expect(lock.free).toHaveBeenCalled()
    })

    it('skips the report and reads nothing when the lock is held by another instance', async () => {
      const app = emptyEstateApp()
      const server = {
        app,
        featureFlags: {
          isPreCpaResubmissionReportEnabled: () => true,
          isPreCpaResubmissionBackfillEnabled: () => false
        },
        locker: { lock: vi.fn().mockResolvedValue(null) }
      }

      await runPreCpaResubmissionBackfill(server)

      expect(
        app.reportsRepository.findAllPeriodicReports
      ).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith({
        message: 'Unable to obtain lock, skipping pre-CPA resubmission'
      })
      expect(logger.error).not.toHaveBeenCalled()
    })

    it('logs a sizing summary and a clean invariant probe when nothing is affected', async () => {
      const server = buildServer(emptyEstateApp())

      await runPreCpaResubmissionBackfill(server)

      expect(logger.error).not.toHaveBeenCalled()
      expect(logger.warn).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Pre-CPA resubmission sizing: scanned 0 submitted reports, 0 would ' +
          'require resubmission, across 0 organisations / 0 registrations. ' +
          'Retrospective -- not a prediction of the next upload.'
      })
      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Invariant check: 0 IGNORED restatements fell in a closed reported period (expected 0)'
      })
    })

    it('logs a retrospective line per affected report and a sizing summary', async () => {
      const server = buildServer(oneFindingApp())

      await runPreCpaResubmissionBackfill(server)

      expect(logger.info).toHaveBeenCalledWith({
        message: expect.stringContaining(
          'report report-1 (Jun 2025, monthly) -- closed period restated by ' +
            'summary log sl-restating'
        )
      })
      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Pre-CPA resubmission sizing: scanned 1 submitted reports, 1 would ' +
          'require resubmission, across 1 organisations / 1 registrations. ' +
          'Retrospective -- not a prediction of the next upload.'
      })
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('warns with report ids when an IGNORED restatement lands in a closed period', async () => {
      const server = buildServer(
        oneFindingApp({ restatingOutcome: WASTE_BALANCE_OUTCOME.IGNORED })
      )

      await runPreCpaResubmissionBackfill(server)

      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Pre-CPA resubmission sizing: scanned 1 submitted reports, 0 would ' +
          'require resubmission, across 0 organisations / 0 registrations. ' +
          'Retrospective -- not a prediction of the next upload.'
      })
      expect(logger.warn).toHaveBeenCalledWith({
        message:
          'Invariant check: 1 IGNORED restatements fell in a closed reported ' +
          'period (expected 0) -- reports report-1'
      })
    })

    it('warns with report ids when a submitted report is missing its submittedAt', async () => {
      const server = buildServer(missingSubmittedAtApp())

      await runPreCpaResubmissionBackfill(server)

      expect(logger.error).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Pre-CPA resubmission sizing: scanned 0 submitted reports, 0 would ' +
          'require resubmission, across 0 organisations / 0 registrations. ' +
          'Retrospective -- not a prediction of the next upload.'
      })
      expect(logger.warn).toHaveBeenCalledWith({
        message:
          'Data integrity: 1 submitted reports missing a submittedAt were ' +
          'skipped from sizing -- reports report-1'
      })
    })

    it('releases the lock and logs an error when the run itself throws', async () => {
      const error = new Error('mongo unavailable')
      const lock = { free: vi.fn().mockResolvedValue(undefined) }
      const app = {
        ...emptyEstateApp(),
        reportsRepository: {
          ...emptyEstateApp().reportsRepository,
          findAllPeriodicReports: vi.fn().mockRejectedValue(error)
        }
      }
      const server = buildServer(app, { lock })

      await runPreCpaResubmissionBackfill(server)

      expect(logger.error).toHaveBeenCalledWith({
        err: error,
        message: 'Failed to run pre-CPA resubmission'
      })
      expect(lock.free).toHaveBeenCalled()
    })

    it('tolerates the locker itself throwing', async () => {
      const error = new Error('locker unavailable')
      const server = {
        app: emptyEstateApp(),
        featureFlags: {
          isPreCpaResubmissionReportEnabled: () => true,
          isPreCpaResubmissionBackfillEnabled: () => false
        },
        locker: { lock: vi.fn().mockRejectedValue(error) }
      }

      await runPreCpaResubmissionBackfill(server)

      expect(logger.error).toHaveBeenCalledWith({
        err: error,
        message: 'Failed to run pre-CPA resubmission'
      })
    })
  })

  describe('backfill step (preCpaResubmissionBackfill, requires CPA enabled)', () => {
    it('does not write when the backfill flag is off, even with findings and CPA on', async () => {
      config.set(CLOSED_PERIOD_ADJUSTMENTS, true)
      const app = oneFindingApp()
      const server = buildServer(app, {
        reportEnabled: false,
        backfillEnabled: false
      })

      await runPreCpaResubmissionBackfill(server)

      expect(server.locker.lock).not.toHaveBeenCalled()
      expect(
        app.reportsRepository.markSubmittedReportsRequiringResubmission
      ).not.toHaveBeenCalled()
    })

    it('does not write when CPA is off, even with the backfill flag on', async () => {
      config.set(CLOSED_PERIOD_ADJUSTMENTS, false)
      const app = oneFindingApp()
      const server = buildServer(app, {
        reportEnabled: false,
        backfillEnabled: true
      })

      await runPreCpaResubmissionBackfill(server)

      expect(server.locker.lock).not.toHaveBeenCalled()
      expect(
        app.reportsRepository.markSubmittedReportsRequiringResubmission
      ).not.toHaveBeenCalled()
    })

    it('runs the backfill even when the report (diagnostic) flag is off', async () => {
      config.set(CLOSED_PERIOD_ADJUSTMENTS, true)
      const app = oneFindingApp()
      app.reportsRepository.markSubmittedReportsRequiringResubmission = vi
        .fn()
        .mockResolvedValue([
          {
            reportId: 'report-1',
            year: 2025,
            cadence: 'monthly',
            period: 6,
            submissionNumber: 1,
            resubmissionRequired: {
              closedPeriodRestated: {
                uploadedAt: '2025-08-01T00:00:00.000Z',
                summaryLogId: 'sl-restating'
              }
            }
          }
        ])
      const server = buildServer(app, {
        reportEnabled: false,
        backfillEnabled: true
      })

      await runPreCpaResubmissionBackfill(server)

      expect(server.locker.lock).toHaveBeenCalledWith('pre-cpa-resubmission')
      expect(server.locker.lock).toHaveBeenCalledTimes(1)
      expect(
        app.reportsRepository.markSubmittedReportsRequiringResubmission
      ).toHaveBeenCalledWith({
        organisationId: 'org-1',
        registrationId: 'reg-1',
        summaryLogId: 'sl-restating',
        uploadedAt: '2025-08-01T00:00:00.000Z',
        periods: [{ year: 2025, cadence: 'monthly', period: 6 }]
      })
      expect(logger.info).toHaveBeenCalledWith({
        message: expect.stringContaining(
          'Pre-CPA resubmission backfill: flagged -- Pre-CPA resubmission ' +
            '(retrospective): org org-1 / registration reg-1, report report-1 ' +
            '(Jun 2025, monthly) -- closed period restated by summary log ' +
            'sl-restating uploaded 2025-08-01T00:00:00.000Z'
        )
      })
      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Pre-CPA resubmission backfill: 1 reports found, 1 newly flagged ' +
          'as requiring resubmission (0 already flagged by an earlier run).'
      })
      // Diagnostic step did not run
      expect(logger.info).not.toHaveBeenCalledWith({
        message: expect.stringContaining('Pre-CPA resubmission sizing')
      })
    })

    it('runs both steps under a single shared lock when both flags are on', async () => {
      config.set(CLOSED_PERIOD_ADJUSTMENTS, true)
      const app = oneFindingApp()
      const server = buildServer(app, {
        reportEnabled: true,
        backfillEnabled: true
      })

      await runPreCpaResubmissionBackfill(server)

      expect(server.locker.lock).toHaveBeenCalledTimes(1)
      expect(logger.info).toHaveBeenCalledWith({
        message: expect.stringContaining('Pre-CPA resubmission sizing')
      })
      expect(logger.info).toHaveBeenCalledWith({
        message: expect.stringContaining('Pre-CPA resubmission backfill')
      })
      expect(
        app.reportsRepository.markSubmittedReportsRequiringResubmission
      ).toHaveBeenCalled()
    })

    it('logs a report already flagged by an earlier run as a no-op, not an error', async () => {
      config.set(CLOSED_PERIOD_ADJUSTMENTS, true)
      const app = oneFindingApp()
      app.reportsRepository.markSubmittedReportsRequiringResubmission = vi
        .fn()
        .mockResolvedValue([])
      const server = buildServer(app, {
        reportEnabled: false,
        backfillEnabled: true
      })

      await runPreCpaResubmissionBackfill(server)

      expect(logger.error).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Pre-CPA resubmission backfill: 1 reports found, 0 newly flagged ' +
          'as requiring resubmission (1 already flagged by an earlier run).'
      })
    })

    it('warns when a write flags a reportId the scan did not attribute the period to', async () => {
      config.set(CLOSED_PERIOD_ADJUSTMENTS, true)
      const app = oneFindingApp()
      app.reportsRepository.markSubmittedReportsRequiringResubmission = vi
        .fn()
        .mockResolvedValue([
          {
            reportId: 'some-other-report',
            year: 2025,
            cadence: 'monthly',
            period: 6,
            submissionNumber: 2,
            resubmissionRequired: {
              closedPeriodRestated: {
                uploadedAt: '2025-08-01T00:00:00.000Z',
                summaryLogId: 'sl-restating'
              }
            }
          }
        ])
      const server = buildServer(app, {
        reportEnabled: false,
        backfillEnabled: true
      })

      await runPreCpaResubmissionBackfill(server)

      expect(logger.warn).toHaveBeenCalledWith({
        message: expect.stringContaining(
          '1 reports were flagged that the scan did not attribute their ' +
            'period to -- likely resubmitted between the scan and the write ' +
            '-- reports some-other-report'
        )
      })
    })

    it('logs a failed group and still releases the lock, without aborting the whole run', async () => {
      config.set(CLOSED_PERIOD_ADJUSTMENTS, true)
      const app = oneFindingApp()
      const writeError = new Error('mongo write failed')
      app.reportsRepository.markSubmittedReportsRequiringResubmission = vi
        .fn()
        .mockRejectedValue(writeError)
      const lock = { free: vi.fn().mockResolvedValue(undefined) }
      const server = buildServer(app, {
        lock,
        reportEnabled: false,
        backfillEnabled: true
      })

      await runPreCpaResubmissionBackfill(server)

      expect(logger.error).toHaveBeenCalledWith({
        err: writeError,
        message: expect.stringContaining(
          'failed to flag org org-1 / registration reg-1, summary log ' +
            'sl-restating -- will retry on the next run'
        )
      })
      expect(lock.free).toHaveBeenCalled()
      // The per-group failure is caught inside backfillPreCpaResubmissionReports,
      // so it does not propagate to the outer catch as a run-level failure.
      expect(logger.error).not.toHaveBeenCalledWith({
        err: expect.anything(),
        message: 'Failed to run pre-CPA resubmission'
      })
    })
  })
})
