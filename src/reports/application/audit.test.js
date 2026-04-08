import { randomBytes } from 'crypto'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const mockAudit = vi.fn()
const mockInsert = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))

const { auditReportStatusTransition, auditReportCreate, auditReportDelete } =
  await import('./audit.js')

const createMockRequest = () => ({
  auth: {
    credentials: {
      id: 'user-1',
      email: 'user@example.gov.uk',
      scope: ['standardUser']
    }
  },
  systemLogsRepository: { insert: mockInsert }
})

const user = {
  id: 'user-1',
  email: 'user@example.gov.uk',
  scope: ['standardUser']
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2025-06-01T12:00:00.000Z'))
  mockInsert.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('auditReportStatusTransition', () => {
  const params = {
    organisationId: 'org-1',
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

    expect(mockInsert).toHaveBeenCalledWith({
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
          reportId: 'rep-1',
          previous: { status: 'in_progress' },
          next: { status: 'ready_to_submit' }
        }
      })
    )

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        event: {
          category: 'waste-reporting',
          subCategory: 'reports',
          action: 'status-transition'
        },
        context: oversizedParams
      })
    )
  })
})

describe('auditReportDelete', () => {
  const params = {
    organisationId: 'org-1',
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

    expect(mockInsert).toHaveBeenCalledWith({
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
    const { randomBytes } = await import('crypto')
    const veryLongString = randomBytes(1e6).toString('hex')
    const oversizedParams = {
      organisationId: 'org-1',
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
          reportId: 'rep-1',
          previous: { status: 'in_progress' }
        }
      })
    )

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        event: {
          category: 'waste-reporting',
          subCategory: 'reports',
          action: 'delete'
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
    reportId: 'rep-1',
    createdAt: '2025-06-01T10:00:00.000Z',
    year: 2025,
    cadence: 'quarterly',
    period: 1
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

    expect(mockInsert).toHaveBeenCalledWith({
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
