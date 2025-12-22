import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const mockAudit = vi.fn()
const mockInsert = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))

const { auditSummaryLogUpload, auditSummaryLogSubmit } =
  await import('./summary-logs.js')

describe('auditSummaryLogUpload', () => {
  const summaryLogId = 'summary-log-123'
  const organisationId = 'org-456'
  const registrationId = 'reg-789'
  const userId = 'user-abc'
  const userEmail = 'test@example.gov.uk'
  const userScope = ['standardUser']

  const createMockRequest = () => ({
    auth: {
      credentials: {
        id: userId,
        email: userEmail,
        scope: userScope
      }
    },
    systemLogsRepository: {
      insert: mockInsert
    }
  })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-12-22T10:00:00.000Z'))
    mockInsert.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('sends audit event to CDP auditing with correct payload', async () => {
    const request = createMockRequest()

    await auditSummaryLogUpload(request, {
      summaryLogId,
      organisationId,
      registrationId
    })

    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: 'waste-reporting',
        subCategory: 'summary-log',
        action: 'upload'
      },
      context: {
        summaryLogId,
        organisationId,
        registrationId
      },
      user: {
        id: userId,
        email: userEmail,
        scope: userScope
      }
    })
  })

  it('records system log with correct structure', async () => {
    const request = createMockRequest()

    await auditSummaryLogUpload(request, {
      summaryLogId,
      organisationId,
      registrationId
    })

    expect(mockInsert).toHaveBeenCalledWith({
      createdAt: new Date('2025-12-22T10:00:00.000Z'),
      createdBy: {
        id: userId,
        email: userEmail,
        scope: userScope
      },
      event: {
        category: 'waste-reporting',
        subCategory: 'summary-log',
        action: 'upload'
      },
      context: {
        summaryLogId,
        organisationId,
        registrationId
      }
    })
  })

  it('handles missing auth credentials gracefully', async () => {
    const request = {
      auth: {},
      systemLogsRepository: {
        insert: mockInsert
      }
    }

    await auditSummaryLogUpload(request, {
      summaryLogId,
      organisationId,
      registrationId
    })

    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: 'waste-reporting',
        subCategory: 'summary-log',
        action: 'upload'
      },
      context: {
        summaryLogId,
        organisationId,
        registrationId
      },
      user: {
        id: undefined,
        email: undefined,
        scope: undefined
      }
    })
  })

  it('skips system log recording when systemLogsRepository is not available', async () => {
    const request = {
      auth: {
        credentials: {
          id: userId,
          email: userEmail,
          scope: userScope
        }
      }
    }

    await auditSummaryLogUpload(request, {
      summaryLogId,
      organisationId,
      registrationId
    })

    expect(mockAudit).toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
  })
})

describe('auditSummaryLogSubmit', () => {
  const summaryLogId = 'summary-log-123'
  const organisationId = 'org-456'
  const registrationId = 'reg-789'
  const userId = 'user-abc'
  const userEmail = 'test@example.gov.uk'
  const userScope = ['standardUser']

  const createMockRequest = () => ({
    auth: {
      credentials: {
        id: userId,
        email: userEmail,
        scope: userScope
      }
    },
    systemLogsRepository: {
      insert: mockInsert
    }
  })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-12-22T10:00:00.000Z'))
    mockInsert.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('sends audit event to CDP auditing with correct payload', async () => {
    const request = createMockRequest()

    await auditSummaryLogSubmit(request, {
      summaryLogId,
      organisationId,
      registrationId
    })

    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: 'waste-reporting',
        subCategory: 'summary-log',
        action: 'submit'
      },
      context: {
        summaryLogId,
        organisationId,
        registrationId
      },
      user: {
        id: userId,
        email: userEmail,
        scope: userScope
      }
    })
  })

  it('records system log with correct structure', async () => {
    const request = createMockRequest()

    await auditSummaryLogSubmit(request, {
      summaryLogId,
      organisationId,
      registrationId
    })

    expect(mockInsert).toHaveBeenCalledWith({
      createdAt: new Date('2025-12-22T10:00:00.000Z'),
      createdBy: {
        id: userId,
        email: userEmail,
        scope: userScope
      },
      event: {
        category: 'waste-reporting',
        subCategory: 'summary-log',
        action: 'submit'
      },
      context: {
        summaryLogId,
        organisationId,
        registrationId
      }
    })
  })
})
