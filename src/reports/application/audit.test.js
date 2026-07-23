import { randomBytes } from 'crypto'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { logger } from '#common/helpers/logging/logger.js'

/**
 * @import { Report } from '#reports/repository/port.js'
 */

/** @typedef {import('#repositories/system-logs/port.js').SystemLogsRepository} SystemLogsRepository */

/**
 * Casts a deliberately-partial report fixture to the full {@link Report} type.
 * The audit functions only read `status.currentStatus`.
 * @param {unknown} value
 * @returns {Report}
 */
const asReport = (value) => /** @type {Report} */ (value)

const mockAudit = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))

const {
  auditReportStatusTransition,
  auditReportCreate,
  auditReportDelete,
  auditMarkReportsStale,
  auditMarkReportsRequiringResubmission,
  auditReportRequestResubmission,
  MARK_STALE_ACTION
} = await import('./audit.js')

const mockInsert = vi.fn()

let systemLogsRepository

const createMockRequest = () =>
  /** @type {import('#common/hapi-types.js').HapiRequest & { systemLogsRepository: SystemLogsRepository }} */ ({
    auth: {
      credentials: {
        id: 'user-1',
        email: 'user@example.gov.uk',
        scope: ['standardUser']
      }
    },
    systemLogsRepository
  })

const findStoredLog = async () => {
  const { systemLogs } = await systemLogsRepository.find({ limit: 10 })
  return systemLogs[0]
}

const user = {
  id: 'user-1',
  email: 'user@example.gov.uk',
  scope: ['standardUser']
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2025-06-01T12:00:00.000Z'))
  systemLogsRepository = createSystemLogsRepository()(logger)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('auditReportStatusTransition', () => {
  const params = {
    organisationId: 'org-1',
    registrationId: 'reg-1',
    year: 2025,
    cadence: 'quarterly',
    period: 1,
    submissionNumber: 1,
    reportId: 'rep-1',
    previous: asReport({
      id: 'rep-1',
      version: 1,
      status: { currentStatus: 'in_progress' }
    }),
    next: asReport({
      id: 'rep-1',
      version: 2,
      status: { currentStatus: 'ready_to_submit' }
    })
  }

  it('sends CDP audit event', async () => {
    await auditReportStatusTransition(createMockRequest(), params)

    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: 'waste-reporting',
        subCategory: 'reports',
        action: 'status-transition'
      },
      context: params,
      user
    })
  })

  it('records system log', async () => {
    await auditReportStatusTransition(createMockRequest(), params)

    const storedLog = await findStoredLog()
    expect(storedLog).toEqual({
      createdAt: new Date('2025-06-01T12:00:00.000Z'),
      createdBy: user,
      event: {
        category: 'waste-reporting',
        subCategory: 'reports',
        action: 'status-transition'
      },
      context: params
    })
  })

  it('strips previous and next from CDP audit event when payload is oversized', async () => {
    const veryLongString = randomBytes(1e6).toString('hex')
    const oversizedParams = {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      year: 2025,
      cadence: 'quarterly',
      period: 1,
      submissionNumber: 1,
      reportId: 'rep-1',
      previous: asReport({
        id: 'rep-1',
        version: 1,
        status: { currentStatus: 'in_progress' },
        veryLongString
      }),
      next: asReport({
        id: 'rep-1',
        version: 2,
        status: { currentStatus: 'ready_to_submit' },
        veryLongString
      })
    }

    await auditReportStatusTransition(createMockRequest(), oversizedParams)

    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: {
          category: 'waste-reporting',
          subCategory: 'reports',
          action: 'status-transition'
        },
        context: {
          organisationId: 'org-1',
          registrationId: 'reg-1',
          year: 2025,
          cadence: 'quarterly',
          period: 1,
          submissionNumber: 1,
          reportId: 'rep-1',
          previous: { status: 'in_progress' },
          next: { status: 'ready_to_submit' }
        }
      })
    )

    const storedLog = await findStoredLog()
    expect(storedLog.event).toEqual({
      category: 'waste-reporting',
      subCategory: 'reports',
      action: 'status-transition'
    })
    expect(storedLog.context).toEqual(oversizedParams)
  })
})

describe('auditReportDelete', () => {
  const params = {
    organisationId: 'org-1',
    registrationId: 'reg-1',
    year: 2025,
    cadence: 'quarterly',
    period: 1,
    submissionNumber: 1,
    reportId: 'rep-1',
    previous: asReport({
      id: 'rep-1',
      version: 1,
      status: { currentStatus: 'in_progress' }
    })
  }

  it('sends CDP audit event with action: delete', async () => {
    await auditReportDelete(createMockRequest(), params)

    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: 'waste-reporting',
        subCategory: 'reports',
        action: 'delete'
      },
      context: params,
      user
    })
  })

  it('records system log', async () => {
    await auditReportDelete(createMockRequest(), params)

    const storedLog = await findStoredLog()
    expect(storedLog).toEqual({
      createdAt: new Date('2025-06-01T12:00:00.000Z'),
      createdBy: user,
      event: {
        category: 'waste-reporting',
        subCategory: 'reports',
        action: 'delete'
      },
      context: params
    })
  })

  it('strips previous to { status } in CDP audit event when payload is oversized', async () => {
    const veryLongString = randomBytes(1e6).toString('hex')
    const oversizedParams = {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      year: 2025,
      cadence: 'quarterly',
      period: 1,
      submissionNumber: 1,
      reportId: 'rep-1',
      previous: asReport({
        id: 'rep-1',
        version: 1,
        status: { currentStatus: 'in_progress' },
        veryLongString
      })
    }

    await auditReportDelete(createMockRequest(), oversizedParams)

    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: {
          category: 'waste-reporting',
          subCategory: 'reports',
          action: 'delete'
        },
        context: {
          organisationId: 'org-1',
          registrationId: 'reg-1',
          year: 2025,
          cadence: 'quarterly',
          period: 1,
          submissionNumber: 1,
          reportId: 'rep-1',
          previous: { status: 'in_progress' }
        }
      })
    )

    const storedLog = await findStoredLog()
    expect(storedLog.event).toEqual({
      category: 'waste-reporting',
      subCategory: 'reports',
      action: 'delete'
    })
    expect(storedLog.context).toEqual(oversizedParams)
  })
})

const systemActor = { id: 'system', email: 'system', scope: [], role: null }

const buildSystemLogsRepository = (
  /** @type {import('vitest').Mock} */ insertMany
) =>
  /** @type {SystemLogsRepository} */ (
    /** @type {unknown} */ ({
      insert: mockInsert,
      insertMany,
      find: vi.fn(),
      findSummaryLogSubmitActors: vi.fn()
    })
  )

const summaryLogChanged = {
  uploadedAt: '2025-06-01T12:00:00.000Z',
  summaryLogId: 'sl-id-00000000-0000-0000-0000-000000000001'
}

const prnCancelled = {
  occurredAt: '2025-06-01T12:00:00.000Z',
  prnId: 'prn-id-00000000-0000-0000-0000-000000000001'
}

/** @type {import('#reports/repository/port.js').ReportResubmissionRequired} */
const resubmissionRequired = {
  closedPeriodRestated: {
    uploadedAt: '2025-06-01T12:00:00.000Z',
    summaryLogId: 'sl-id-00000000-0000-0000-0000-000000000001'
  }
}

const flaggedReport = {
  reportId: 'rep-1',
  year: 2025,
  cadence: 'quarterly',
  period: 1,
  submissionNumber: 1
}

describe.each([
  {
    name: 'auditMarkReportsStale (summary log)',
    action: MARK_STALE_ACTION.SUMMARY_LOG_CHANGED,
    field: 'stale',
    flag: { summaryLogChanged },
    run: (/** @type {SystemLogsRepository} */ systemLogsRepository) =>
      auditMarkReportsStale({
        systemLogsRepository,
        organisationId: 'org-1',
        registrationId: 'reg-1',
        reportsMarkedStale: [
          { ...flaggedReport, stale: { summaryLogChanged } }
        ],
        action: MARK_STALE_ACTION.SUMMARY_LOG_CHANGED
      })
  },
  {
    name: 'auditMarkReportsStale (PRN cancelled)',
    action: MARK_STALE_ACTION.PRN_CANCELLED,
    field: 'stale',
    flag: { prnCancelled },
    run: (/** @type {SystemLogsRepository} */ systemLogsRepository) =>
      auditMarkReportsStale({
        systemLogsRepository,
        organisationId: 'org-1',
        registrationId: 'reg-1',
        reportsMarkedStale: [{ ...flaggedReport, stale: { prnCancelled } }],
        action: MARK_STALE_ACTION.PRN_CANCELLED
      })
  },
  {
    name: 'auditMarkReportsRequiringResubmission',
    action: 'mark-requiring-resubmission',
    field: 'resubmissionRequired',
    flag: resubmissionRequired,
    run: (/** @type {SystemLogsRepository} */ systemLogsRepository) =>
      auditMarkReportsRequiringResubmission({
        systemLogsRepository,
        organisationId: 'org-1',
        registrationId: 'reg-1',
        reportsRequiringResubmission: [
          { ...flaggedReport, resubmissionRequired }
        ]
      })
  }
])('$name', ({ action, field, flag, run }) => {
  const mockInsertMany = vi.fn()

  const event = { category: 'waste-reporting', subCategory: 'reports', action }

  const context = {
    ...flaggedReport,
    organisationId: 'org-1',
    registrationId: 'reg-1',
    previous: { [field]: null },
    next: { [field]: flag }
  }

  beforeEach(() => {
    mockInsertMany.mockResolvedValue(undefined)
  })

  it('sends one CDP audit event per report', async () => {
    await run(buildSystemLogsRepository(mockInsertMany))

    expect(mockAudit).toHaveBeenCalledExactlyOnceWith({
      user: systemActor,
      event,
      context
    })
  })

  it('batch-inserts one system log per report', async () => {
    await run(buildSystemLogsRepository(mockInsertMany))

    expect(mockInsertMany).toHaveBeenCalledExactlyOnceWith([
      {
        createdAt: new Date('2025-06-01T12:00:00.000Z'),
        createdBy: systemActor,
        event,
        context
      }
    ])
  })
})

describe('auditReportCreate', () => {
  const params = {
    organisationId: 'org-1',
    registrationId: 'reg-1',
    year: 2025,
    cadence: 'quarterly',
    period: 1,
    submissionNumber: 1,
    reportId: 'rep-1',
    createdAt: '2025-06-01T10:00:00.000Z'
  }

  it('sends CDP audit event', async () => {
    await auditReportCreate(createMockRequest(), params)

    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: 'waste-reporting',
        subCategory: 'reports',
        action: 'create'
      },
      context: params,
      user
    })
  })

  it('records system log', async () => {
    await auditReportCreate(createMockRequest(), params)

    const storedLog = await findStoredLog()
    expect(storedLog).toEqual({
      createdAt: new Date('2025-06-01T12:00:00.000Z'),
      createdBy: user,
      event: {
        category: 'waste-reporting',
        subCategory: 'reports',
        action: 'create'
      },
      context: params
    })
  })
})

describe('auditReportRequestResubmission', () => {
  const params = {
    organisationId: 'org-1',
    registrationId: 'reg-1',
    year: 2025,
    cadence: 'quarterly',
    period: 1,
    submissionNumber: 2,
    reportId: 'rep-1',
    resubmissionRequired: {
      operatorRequested: {
        requestedAt: '2025-06-01T12:00:00.000Z',
        requestedBy: { id: 'user-1', name: 'Alice', position: 'Officer' }
      }
    }
  }

  it('sends CDP audit event', async () => {
    await auditReportRequestResubmission(createMockRequest(), params)

    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: 'waste-reporting',
        subCategory: 'reports',
        action: 'request-resubmission'
      },
      context: params,
      user
    })
  })

  it('records system log', async () => {
    await auditReportRequestResubmission(createMockRequest(), params)

    const storedLog = await findStoredLog()
    expect(storedLog).toEqual({
      createdAt: new Date('2025-06-01T12:00:00.000Z'),
      createdBy: user,
      event: {
        category: 'waste-reporting',
        subCategory: 'reports',
        action: 'request-resubmission'
      },
      context: params
    })
  })
})
