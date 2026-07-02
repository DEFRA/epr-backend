import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { STALE_REASON } from '#reports/domain/stale.js'
import { RESUBMISSION_REASON } from '#reports/domain/resubmission.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { config } from '#root/config.js'
import {
  buildCreateReportParams,
  DEFAULT_ORG_ID,
  DEFAULT_REG_ID,
  DEFAULT_REPORT_YEAR,
  DEFAULT_REPORT_PERIOD,
  DEFAULT_CHANGED_BY
} from '#reports/repository/contract/test-data.js'
import { createOnSummaryLogUploaded } from './summary-log-events.js'

// helpers

import {
  REPORT_STATUS,
  REPORT_STATUS_SLOT
} from '#reports/domain/report-status.js'

/**
 * @import { SummaryLogUploadedParams, SummaryLogUploadedRepositories } from './summary-log-events.js'
 */

const CLOSED_PERIOD_ADJUSTMENTS = 'featureFlags.closedPeriodAdjustments'

const mockAuditMarkReportsStale = vi.fn()
const mockAuditMarkReportsRequiringResubmission = vi.fn()

vi.mock('#reports/application/audit.js', () => ({
  auditMarkReportsStale: (...args) => mockAuditMarkReportsStale(...args),
  auditMarkReportsRequiringResubmission: (...args) =>
    mockAuditMarkReportsRequiringResubmission(...args)
}))

/**
 * @param {SummaryLogUploadedParams & SummaryLogUploadedRepositories} args
 */
const onSummaryLogUploaded = ({
  reportsRepository,
  systemLogsRepository,
  ...params
}) =>
  createOnSummaryLogUploaded({ reportsRepository, systemLogsRepository })(
    params
  )

const buildSystemLogsRepository = () => ({
  insert: vi.fn().mockResolvedValue(undefined),
  insertMany: vi.fn().mockResolvedValue(undefined),
  find: vi.fn(),
  findSummaryLogSubmitActors: vi.fn()
})

const FIXED_NOW = '2025-06-01T12:00:00.000Z'
const DEFAULT_SL_ID = 'sl-id-new-000000000000000000000001'

const closedPeriod = {
  year: DEFAULT_REPORT_YEAR,
  cadence: 'monthly',
  period: DEFAULT_REPORT_PERIOD
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(FIXED_NOW))
  config.set(CLOSED_PERIOD_ADJUSTMENTS, true)
  mockAuditMarkReportsStale.mockResolvedValue(undefined)
  mockAuditMarkReportsRequiringResubmission.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  config.set(CLOSED_PERIOD_ADJUSTMENTS, false)
})

describe('onSummaryLogUploaded', () => {
  it('marks a single in_progress report as stale', async () => {
    const reportsRepositoryFactory = createInMemoryReportsRepository()
    const repo = reportsRepositoryFactory()

    const { id: reportId } = await repo.createReport(buildCreateReportParams())

    await onSummaryLogUploaded({
      organisationId: DEFAULT_ORG_ID,
      registrationId: DEFAULT_REG_ID,
      summaryLogId: DEFAULT_SL_ID,
      reportsRepository: reportsRepositoryFactory(),
      systemLogsRepository: buildSystemLogsRepository()
    })

    const updated = await reportsRepositoryFactory().findReportById(reportId)
    expect(updated.stale).toEqual({
      uploadedAt: FIXED_NOW,
      reason: STALE_REASON.SUMMARY_LOG_CHANGED,
      summaryLogId: DEFAULT_SL_ID
    })
  })

  it('does not mark a submitted report as stale', async () => {
    const reportsRepositoryFactory = createInMemoryReportsRepository()

    const { id: reportId } = await createAndSubmitReport(
      reportsRepositoryFactory()
    )

    await onSummaryLogUploaded({
      organisationId: DEFAULT_ORG_ID,
      registrationId: DEFAULT_REG_ID,
      summaryLogId: DEFAULT_SL_ID,
      reportsRepository: reportsRepositoryFactory(),
      systemLogsRepository: buildSystemLogsRepository()
    })

    const unchanged = await reportsRepositoryFactory().findReportById(reportId)
    expect(unchanged.stale).toBeUndefined()
  })

  it('marks all active reports as stale when multiple exist', async () => {
    const MONTHLY_PERIODS = { January: 1, February: 2 }
    const reportsRepositoryFactory = createInMemoryReportsRepository()
    const repo = reportsRepositoryFactory()

    const { id: id1 } = await repo.createReport(
      buildCreateReportParams({
        cadence: 'monthly',
        period: MONTHLY_PERIODS.January
      })
    )
    const { id: id2 } = await repo.createReport(
      buildCreateReportParams({
        cadence: 'monthly',
        period: MONTHLY_PERIODS.February,
        submissionNumber: 2
      })
    )

    await onSummaryLogUploaded({
      organisationId: DEFAULT_ORG_ID,
      registrationId: DEFAULT_REG_ID,
      summaryLogId: DEFAULT_SL_ID,
      reportsRepository: reportsRepositoryFactory(),
      systemLogsRepository: buildSystemLogsRepository()
    })

    const repo2 = reportsRepositoryFactory()
    const updated1 = await repo2.findReportById(id1)
    const updated2 = await repo2.findReportById(id2)

    expect(updated1.stale?.reason).toBe(STALE_REASON.SUMMARY_LOG_CHANGED)
    expect(updated2.stale?.reason).toBe(STALE_REASON.SUMMARY_LOG_CHANGED)
  })

  it('audits stale reports in a single batch call', async () => {
    const reportsRepositoryFactory = createInMemoryReportsRepository()
    const repo = reportsRepositoryFactory()

    await repo.createReport(buildCreateReportParams())

    const systemLogsRepository = buildSystemLogsRepository()

    await onSummaryLogUploaded({
      organisationId: DEFAULT_ORG_ID,
      registrationId: DEFAULT_REG_ID,
      summaryLogId: DEFAULT_SL_ID,
      reportsRepository: reportsRepositoryFactory(),
      systemLogsRepository
    })

    expect(mockAuditMarkReportsStale).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        systemLogsRepository,
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID,
        reportsMarkedStale: expect.arrayContaining([
          expect.objectContaining({
            stale: expect.objectContaining({
              reason: STALE_REASON.SUMMARY_LOG_CHANGED,
              summaryLogId: DEFAULT_SL_ID
            })
          })
        ])
      })
    )
  })

  it('does nothing when there are no active reports', async () => {
    await onSummaryLogUploaded({
      organisationId: DEFAULT_ORG_ID,
      registrationId: DEFAULT_REG_ID,
      summaryLogId: DEFAULT_SL_ID,
      reportsRepository: createInMemoryReportsRepository()(),
      systemLogsRepository: buildSystemLogsRepository()
    })

    expect(mockAuditMarkReportsStale).not.toHaveBeenCalled()
  })

  it('flags the latest submitted report requiring resubmission for the given closed periods', async () => {
    const reportsRepositoryFactory = createInMemoryReportsRepository()
    const { id: reportId } = await createAndSubmitReport(
      reportsRepositoryFactory()
    )

    await onSummaryLogUploaded({
      organisationId: DEFAULT_ORG_ID,
      registrationId: DEFAULT_REG_ID,
      summaryLogId: DEFAULT_SL_ID,
      closedPeriods: [closedPeriod],
      reportsRepository: reportsRepositoryFactory(),
      systemLogsRepository: buildSystemLogsRepository()
    })

    const updated = await reportsRepositoryFactory().findReportById(reportId)
    expect(updated.resubmissionRequired).toEqual({
      uploadedAt: FIXED_NOW,
      reason: RESUBMISSION_REASON.CLOSED_PERIOD_RESTATED,
      summaryLogId: DEFAULT_SL_ID
    })
  })

  it('audits the reports flagged requiring resubmission', async () => {
    const reportsRepositoryFactory = createInMemoryReportsRepository()
    await createAndSubmitReport(reportsRepositoryFactory())
    const systemLogsRepository = buildSystemLogsRepository()

    await onSummaryLogUploaded({
      organisationId: DEFAULT_ORG_ID,
      registrationId: DEFAULT_REG_ID,
      summaryLogId: DEFAULT_SL_ID,
      closedPeriods: [closedPeriod],
      reportsRepository: reportsRepositoryFactory(),
      systemLogsRepository
    })

    expect(
      mockAuditMarkReportsRequiringResubmission
    ).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        systemLogsRepository,
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID,
        reportsRequiringResubmission: expect.arrayContaining([
          expect.objectContaining({
            resubmissionRequired: expect.objectContaining({
              reason: RESUBMISSION_REASON.CLOSED_PERIOD_RESTATED,
              summaryLogId: DEFAULT_SL_ID
            })
          })
        ])
      })
    )
  })

  it('does not flag resubmission when there are no closed periods', async () => {
    const reportsRepositoryFactory = createInMemoryReportsRepository()
    const { id: reportId } = await createAndSubmitReport(
      reportsRepositoryFactory()
    )

    await onSummaryLogUploaded({
      organisationId: DEFAULT_ORG_ID,
      registrationId: DEFAULT_REG_ID,
      summaryLogId: DEFAULT_SL_ID,
      reportsRepository: reportsRepositoryFactory(),
      systemLogsRepository: buildSystemLogsRepository()
    })

    const unchanged = await reportsRepositoryFactory().findReportById(reportId)
    expect(unchanged.resubmissionRequired).toBeUndefined()
    expect(mockAuditMarkReportsRequiringResubmission).not.toHaveBeenCalled()
  })

  it('does not flag resubmission when the closed-period-adjustments flag is off', async () => {
    config.set(CLOSED_PERIOD_ADJUSTMENTS, false)
    const reportsRepositoryFactory = createInMemoryReportsRepository()
    const { id: reportId } = await createAndSubmitReport(
      reportsRepositoryFactory()
    )

    await onSummaryLogUploaded({
      organisationId: DEFAULT_ORG_ID,
      registrationId: DEFAULT_REG_ID,
      summaryLogId: DEFAULT_SL_ID,
      closedPeriods: [closedPeriod],
      reportsRepository: reportsRepositoryFactory(),
      systemLogsRepository: buildSystemLogsRepository()
    })

    const unchanged = await reportsRepositoryFactory().findReportById(reportId)
    expect(unchanged.resubmissionRequired).toBeUndefined()
    expect(mockAuditMarkReportsRequiringResubmission).not.toHaveBeenCalled()
  })
})

async function createAndSubmitReport(repo) {
  const { id } = await repo.createReport(buildCreateReportParams())
  await repo.updateReportStatus({
    reportId: id,
    version: 1,
    status: REPORT_STATUS.READY_TO_SUBMIT,
    slot: REPORT_STATUS_SLOT.READY,
    changedBy: DEFAULT_CHANGED_BY
  })
  await repo.updateReportStatus({
    reportId: id,
    version: 2,
    status: REPORT_STATUS.SUBMITTED,
    slot: REPORT_STATUS_SLOT.SUBMITTED,
    changedBy: DEFAULT_CHANGED_BY,
    submissionDeclaredBy: 'Test User'
  })
  return { id }
}
