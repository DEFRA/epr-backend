import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import {
  buildCreateReportParams,
  DEFAULT_ORG_ID,
  DEFAULT_REG_ID,
  DEFAULT_REPORT_YEAR,
  DEFAULT_REPORT_PERIOD,
  DEFAULT_CHANGED_BY
} from '#reports/repository/contract/test-data.js'
import {
  REPORT_STATUS,
  REPORT_STATUS_SLOT
} from '#reports/domain/report-status.js'
import { createOnPrnCancelled } from './prn-cancellation-events.js'

/**
 * @import { PrnCancelledParams, PrnCancelledRepositories } from './prn-cancellation-events.js'
 */

const mockAuditMarkReportsStale = vi.fn()

vi.mock(import('#reports/application/audit.js'), async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    auditMarkReportsStale: (...args) => mockAuditMarkReportsStale(...args)
  }
})

/**
 * @param {PrnCancelledParams & PrnCancelledRepositories} args
 */
const onPrnCancelled = ({
  reportsRepository,
  systemLogsRepository,
  ...params
}) => createOnPrnCancelled({ reportsRepository, systemLogsRepository })(params)

const buildSystemLogsRepository = () => ({
  insert: vi.fn().mockResolvedValue(undefined),
  insertMany: vi.fn().mockResolvedValue(undefined),
  find: vi.fn(),
  findSummaryLogSubmitActors: vi.fn()
})

const FIXED_NOW = '2025-06-01T12:00:00.000Z'
const PRN_ID = 'prn-id-000000000000000000000001'
// Falls within the default January 2024 report's period (2024-01-01 to 2024-01-31).
const ISSUED_AT_IN_PERIOD = '2024-01-15T00:00:00.000Z'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(FIXED_NOW))
  mockAuditMarkReportsStale.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
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

describe('onPrnCancelled', () => {
  it('marks the active report whose period contains issuedAt as stale', async () => {
    const reportsRepositoryFactory = createInMemoryReportsRepository()
    const repo = reportsRepositoryFactory()

    const { id: reportId } = await repo.createReport(buildCreateReportParams())

    await onPrnCancelled({
      organisationId: DEFAULT_ORG_ID,
      registrationId: DEFAULT_REG_ID,
      prnId: PRN_ID,
      issuedAt: ISSUED_AT_IN_PERIOD,
      reportsRepository: reportsRepositoryFactory(),
      systemLogsRepository: buildSystemLogsRepository()
    })

    const updated = await reportsRepositoryFactory().findReportById(reportId)
    expect(updated.stale).toEqual({
      prnCancelled: {
        occurredAt: FIXED_NOW,
        prnId: PRN_ID
      }
    })
  })

  it('audits the report marked stale', async () => {
    const reportsRepositoryFactory = createInMemoryReportsRepository()
    const repo = reportsRepositoryFactory()

    await repo.createReport(
      buildCreateReportParams({
        year: DEFAULT_REPORT_YEAR,
        cadence: 'monthly',
        period: DEFAULT_REPORT_PERIOD
      })
    )

    const systemLogsRepository = buildSystemLogsRepository()

    await onPrnCancelled({
      organisationId: DEFAULT_ORG_ID,
      registrationId: DEFAULT_REG_ID,
      prnId: PRN_ID,
      issuedAt: ISSUED_AT_IN_PERIOD,
      reportsRepository: reportsRepositoryFactory(),
      systemLogsRepository
    })

    expect(mockAuditMarkReportsStale).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        systemLogsRepository,
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID,
        action: 'mark-stale-prn-cancelled',
        reportsMarkedStale: expect.arrayContaining([
          expect.objectContaining({
            stale: expect.objectContaining({
              prnCancelled: expect.objectContaining({ prnId: PRN_ID })
            })
          })
        ])
      })
    )
  })

  it('does not touch a submitted report', async () => {
    const reportsRepositoryFactory = createInMemoryReportsRepository()
    const { id: reportId } = await createAndSubmitReport(
      reportsRepositoryFactory()
    )

    await onPrnCancelled({
      organisationId: DEFAULT_ORG_ID,
      registrationId: DEFAULT_REG_ID,
      prnId: PRN_ID,
      issuedAt: ISSUED_AT_IN_PERIOD,
      reportsRepository: reportsRepositoryFactory(),
      systemLogsRepository: buildSystemLogsRepository()
    })

    const unchanged = await reportsRepositoryFactory().findReportById(reportId)
    expect(unchanged.stale).toBeUndefined()
    expect(mockAuditMarkReportsStale).not.toHaveBeenCalled()
  })

  it('does nothing when no report exists for the org/registration at all', async () => {
    await onPrnCancelled({
      organisationId: DEFAULT_ORG_ID,
      registrationId: DEFAULT_REG_ID,
      prnId: PRN_ID,
      issuedAt: ISSUED_AT_IN_PERIOD,
      reportsRepository: createInMemoryReportsRepository()(),
      systemLogsRepository: buildSystemLogsRepository()
    })

    expect(mockAuditMarkReportsStale).not.toHaveBeenCalled()
  })
})
