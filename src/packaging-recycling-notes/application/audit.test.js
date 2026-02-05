import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const mockAudit = vi.fn()
const mockInsert = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))

const { auditPrnStatusTransition } = await import('./audit.js')

describe('auditPrnStatusTransition', () => {
  const prnId = 'prn-123'
  const organisationId = 'org-456'
  const accreditationId = 'acc-789'
  const previousStatus = 'awaiting_authorisation'
  const newStatus = 'awaiting_acceptance'
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

    await auditPrnStatusTransition(request, {
      prnId,
      organisationId,
      accreditationId,
      previousStatus,
      newStatus
    })

    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: 'waste-reporting',
        subCategory: 'packaging-recycling-note',
        action: 'status-transition'
      },
      context: {
        prnId,
        organisationId,
        accreditationId,
        previousStatus,
        newStatus
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

    await auditPrnStatusTransition(request, {
      prnId,
      organisationId,
      accreditationId,
      previousStatus,
      newStatus
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
        subCategory: 'packaging-recycling-note',
        action: 'status-transition'
      },
      context: {
        prnId,
        organisationId,
        accreditationId,
        previousStatus,
        newStatus
      }
    })
  })
})
