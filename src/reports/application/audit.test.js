import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const mockAudit = vi.fn()
const mockInsert = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))

const { auditReportStatusTransition, auditReportCreate } =
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
    previous: { status: 'in_progress', version: 1 },
    next: { status: 'ready_to_submit', version: 2 }
  }

  it('sends CDP audit event', async () => {
    await auditReportStatusTransition(createMockRequest(), params)

    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: 'reports',
        subCategory: 'status',
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
        category: 'reports',
        subCategory: 'status',
        action: 'status-transition'
      },
      context: params
    })
  })
})

describe('auditReportCreate', () => {
  const params = {
    organisationId: 'org-1',
    registrationId: 'reg-1',
    reportId: 'rep-1',
    year: 2025,
    cadence: 'quarterly',
    period: 1
  }

  it('sends CDP audit event', async () => {
    await auditReportCreate(createMockRequest(), params)

    expect(mockAudit).toHaveBeenCalledWith({
      event: { category: 'reports', subCategory: 'report', action: 'create' },
      context: params,
      user
    })
  })

  it('records system log', async () => {
    await auditReportCreate(createMockRequest(), params)

    expect(mockInsert).toHaveBeenCalledWith({
      createdAt: new Date('2025-06-01T12:00:00.000Z'),
      createdBy: user,
      event: { category: 'reports', subCategory: 'report', action: 'create' },
      context: params
    })
  })
})
