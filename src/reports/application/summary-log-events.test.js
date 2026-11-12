import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import {
  buildCreateReportParams,
  DEFAULT_ORG_NUMBER,
  DEFAULT_REG_NUMBER,
  DEFAULT_REPORT_YEAR,
  DEFAULT_REPORT_PERIOD,
  DEFAULT_CHANGED_BY,
  NEXT_YEAR_REPORT
} from '#reports/repository/contract/test-data.js'
import { createOnSummaryLogUploaded } from './summary-log-events.js'

// helpers

import {
  REPORT_STATUS,
  REPORT_STATUS_SLOT
} from '#reports/domain/report-status.js'
import { toSummaryLogFileId } from '#domain/summary-logs/ids.js'

/**
 * @import { SummaryLogUploadedParams, SummaryLogUploadedRepositories } from './summary-log-events.js'
 */

const mockAuditMarkReportsStale = vi.fn()
const mockAuditMarkReportsRequiringResubmission = vi.fn()

vi.mock(import('#reports/application/audit.js'), async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    auditMarkReportsStale: (...args) => mockAuditMarkReportsStale(...args),
    auditMarkReportsRequiringResubmission: (...args) =>
      mockAuditMarkReportsRequiringResubmission(...args)
  }
})

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
  mockAuditMarkReportsStale.mockResolvedValue(undefined)
  mockAuditMarkReportsRequiringResubmission.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('onSummaryLogUploaded', () => {
  it('marks a single in_progress report as stale', async () => {
    const reportsRepositoryFactory = createInMemoryReportsRepository()
    const repo = reportsRepositoryFactory()

    const { id: reportId } = await repo.createReport(buildCreateReportParams())

    await onSummaryLogUploaded({
      organisationNumber: DEFAULT_ORG_NUMBER,
      registrationNumber: DEFAULT_REG_NUMBER,
      year: DEFAULT_REPORT_YEAR,
      summaryLogId: toSummaryLogFileId(DEFAULT_SL_ID),
      reportsRepository: reportsRepositoryFactory(),
      systemLogsRepository: buildSystemLogsRepository()
    })

    const updated = await reportsRepositoryFactory().findReportById(reportId)
    expect(updated.stale).toEqual({
      summaryLogChanged: {
        uploadedAt: FIXED_NOW,
        summaryLogId: DEFAULT_SL_ID
      }
    })
  })

  it('does not mark stale an in_progress report for a different year', async () => {
    const reportsRepositoryFactory = createInMemoryReportsRepository()
    const { id: reportId } = await reportsRepositoryFactory().createReport(
      buildCreateReportParams(NEXT_YEAR_REPORT)
    )

    await onSummaryLogUploaded({
      organisationNumber: DEFAULT_ORG_NUMBER,
      registrationNumber: DEFAULT_REG_NUMBER,
      year: DEFAULT_REPORT_YEAR,
      summaryLogId: toSummaryLogFileId(DEFAULT_SL_ID),
      reportsRepository: reportsRepositoryFactory(),
      systemLogsRepository: buildSystemLogsRepository()
    })

    const unchanged = await reportsRepositoryFactory().findReportById(reportId)
    expect(unchanged.stale).toBeUndefined()
    expect(mockAuditMarkReportsStale).not.toHaveBeenCalled()
  })

  it('does not mark a submitted report as stale', async () => {
    const reportsRepositoryFactory = createInMemoryReportsRepository()

    const { id: reportId } = await createAndSubmitReport(
      reportsRepositoryFactory()
    )

    await onSummaryLogUploaded({
      organisationNumber: DEFAULT_ORG_NUMBER,
      registrationNumber: DEFAULT_REG_NUMBER,
      year: DEFAULT_REPORT_YEAR,
      summaryLogId: toSummaryLogFileId(DEFAULT_SL_ID),
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
      organisationNumber: DEFAULT_ORG_NUMBER,
      registrationNumber: DEFAULT_REG_NUMBER,
      year: DEFAULT_REPORT_YEAR,
      summaryLogId: toSummaryLogFileId(DEFAULT_SL_ID),
      reportsRepository: reportsRepositoryFactory(),
      systemLogsRepository: buildSystemLogsRepository()
    })

    const repo2 = reportsRepositoryFactory()
    const updated1 = await repo2.findReportById(id1)
    const updated2 = await repo2.findReportById(id2)

    expect(updated1.stale?.summaryLogChanged?.summaryLogId).toBe(DEFAULT_SL_ID)
    expect(updated2.stale?.summaryLogChanged?.summaryLogId).toBe(DEFAULT_SL_ID)
  })

  it('audits stale reports in a single batch call', async () => {
    const reportsRepositoryFactory = createInMemoryReportsRepository()
    const repo = reportsRepositoryFactory()

    await repo.createReport(buildCreateReportParams())

    const systemLogsRepository = buildSystemLogsRepository()

    await onSummaryLogUploaded({
      organisationNumber: DEFAULT_ORG_NUMBER,
      registrationNumber: DEFAULT_REG_NUMBER,
      year: DEFAULT_REPORT_YEAR,
      summaryLogId: toSummaryLogFileId(DEFAULT_SL_ID),
      reportsRepository: reportsRepositoryFactory(),
      systemLogsRepository
    })

    expect(mockAuditMarkReportsStale).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        systemLogsRepository,
        organisationNumber: DEFAULT_ORG_NUMBER,
        registrationNumber: DEFAULT_REG_NUMBER,
        reportsMarkedStale: expect.arrayContaining([
          expect.objectContaining({
            stale: expect.objectContaining({
              summaryLogChanged: expect.objectContaining({
                summaryLogId: DEFAULT_SL_ID
              })
            })
          })
        ])
      })
    )
  })

  it('does nothing when there are no active reports', async () => {
    await onSummaryLogUploaded({
      organisationNumber: DEFAULT_ORG_NUMBER,
      registrationNumber: DEFAULT_REG_NUMBER,
      year: DEFAULT_REPORT_YEAR,
      summaryLogId: toSummaryLogFileId(DEFAULT_SL_ID),
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
      organisationNumber: DEFAULT_ORG_NUMBER,
      registrationNumber: DEFAULT_REG_NUMBER,
      year: DEFAULT_REPORT_YEAR,
      summaryLogId: toSummaryLogFileId(DEFAULT_SL_ID),
      periodsRequiringResubmission: [closedPeriod],
      reportsRepository: reportsRepositoryFactory(),
      systemLogsRepository: buildSystemLogsRepository()
    })

    const updated = await reportsRepositoryFactory().findReportById(reportId)
    expect(updated.resubmissionRequired).toEqual({
      closedPeriodRestated: {
        uploadedAt: FIXED_NOW,
        summaryLogId: DEFAULT_SL_ID
      }
    })
  })

  it('audits the reports flagged requiring resubmission', async () => {
    const reportsRepositoryFactory = createInMemoryReportsRepository()
    await createAndSubmitReport(reportsRepositoryFactory())
    const systemLogsRepository = buildSystemLogsRepository()

    await onSummaryLogUploaded({
      organisationNumber: DEFAULT_ORG_NUMBER,
      registrationNumber: DEFAULT_REG_NUMBER,
      year: DEFAULT_REPORT_YEAR,
      summaryLogId: toSummaryLogFileId(DEFAULT_SL_ID),
      periodsRequiringResubmission: [closedPeriod],
      reportsRepository: reportsRepositoryFactory(),
      systemLogsRepository
    })

    expect(
      mockAuditMarkReportsRequiringResubmission
    ).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        systemLogsRepository,
        organisationNumber: DEFAULT_ORG_NUMBER,
        registrationNumber: DEFAULT_REG_NUMBER,
        reportsRequiringResubmission: expect.arrayContaining([
          expect.objectContaining({
            resubmissionRequired: expect.objectContaining({
              closedPeriodRestated: expect.objectContaining({
                summaryLogId: DEFAULT_SL_ID
              })
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
      organisationNumber: DEFAULT_ORG_NUMBER,
      registrationNumber: DEFAULT_REG_NUMBER,
      year: DEFAULT_REPORT_YEAR,
      summaryLogId: toSummaryLogFileId(DEFAULT_SL_ID),
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
