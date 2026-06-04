import { randomBytes } from 'crypto'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { logger } from '#common/helpers/logging/logger.js'

const mockAudit = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))

const {
  auditReportStatusTransition,
  auditReportCreate,
  auditReportDelete,
  auditMarkReportStale
} = await import('./audit.js')

const mockInsert = vi.fn()

let systemLogsRepository

const createMockRequest = () =>
  /** @type {import('#common/hapi-types.js').HapiRequest & { systemLogsRepository: import('#repositories/system-logs/port.js').SystemLogsRepository }} */ ({
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
    previous: {
      id: 'rep-1',
      version: 1,
      status: { currentStatus: 'in_progress' }
    },
    next: {
      id: 'rep-1',
      version: 2,
      status: { currentStatus: 'ready_to_submit' }
    }
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
      previous: {
        id: 'rep-1',
        version: 1,
        status: { currentStatus: 'in_progress' },
        veryLongString
      },
      next: {
        id: 'rep-1',
        version: 2,
        status: { currentStatus: 'ready_to_submit' },
        veryLongString
      }
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
    previous: {
      id: 'rep-1',
      version: 1,
      status: { currentStatus: 'in_progress' }
    }
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
      previous: {
        id: 'rep-1',
        version: 1,
        status: { currentStatus: 'in_progress' },
        veryLongString
      }
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

describe('auditMarkReportStale', () => {
  const systemActor = { id: 'system', email: 'system', scope: [] }
  const params = {
    organisationId: 'org-1',
    registrationId: 'reg-1',
    year: 2025,
    cadence: 'quarterly',
    period: 1,
    submissionNumber: 1,
    reportId: 'rep-1',
    previous: {
      id: 'rep-1',
      version: 1,
      status: { currentStatus: 'in_progress' }
    },
    next: {
      id: 'rep-1',
      version: 2,
      status: { currentStatus: 'in_progress' },
      stale: { at: '2025-01-01T00:00:00.000Z', reason: 'summary_log_changed' }
    }
  }

  it('sends CDP audit event', async () => {
    await auditMarkReportStale({
      systemLogsRepository:
        /** @type {import('#repositories/system-logs/port.js').SystemLogsRepository} */ (
          /** @type {unknown} */ ({
            insert: mockInsert,
            find: vi.fn(),
            findSummaryLogSubmitActors: vi.fn()
          })
        ),
      ...params
    })

    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: 'waste-reporting',
        subCategory: 'reports',
        action: 'mark-stale'
      },
      context: params,
      user: systemActor
    })
  })

  it('records system log', async () => {
    await auditMarkReportStale({
      systemLogsRepository:
        /** @type {import('#repositories/system-logs/port.js').SystemLogsRepository} */ (
          /** @type {unknown} */ ({
            insert: mockInsert,
            find: vi.fn(),
            findSummaryLogSubmitActors: vi.fn()
          })
        ),
      ...params
    })

    expect(mockInsert).toHaveBeenCalledWith({
      createdAt: new Date('2025-06-01T12:00:00.000Z'),
      createdBy: systemActor,
      event: {
        category: 'waste-reporting',
        subCategory: 'reports',
        action: 'mark-stale'
      },
      context: params
    })
  })

  it('strips previous and next in CDP audit event when payload is oversized', async () => {
    const veryLongString = randomBytes(1e6).toString('hex')
    const oversizedParams = {
      ...params,
      previous: {
        ...params.previous,
        veryLongString
      },
      next: {
        ...params.next,
        veryLongString
      }
    }

    await auditMarkReportStale({
      systemLogsRepository:
        /** @type {import('#repositories/system-logs/port.js').SystemLogsRepository} */ (
          /** @type {unknown} */ ({
            insert: mockInsert,
            find: vi.fn(),
            findSummaryLogSubmitActors: vi.fn()
          })
        ),
      ...oversizedParams
    })

    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: {
          category: 'waste-reporting',
          subCategory: 'reports',
          action: 'mark-stale'
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
          next: { status: 'in_progress', stale: params.next.stale }
        }
      })
    )

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        event: {
          category: 'waste-reporting',
          subCategory: 'reports',
          action: 'mark-stale'
        },
        context: oversizedParams
      })
    )
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
