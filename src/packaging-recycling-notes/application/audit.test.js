import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const mockAudit = vi.fn()
const mockInsert = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))

const { auditPrnStatusTransition } = await import('./audit.js')

describe('auditPrnStatusTransition', () => {
  const prnId = 'prn-123'
  const userId = 'user-abc'
  const userEmail = 'test@example.gov.uk'
  const userScope = ['standardUser']

  const previousPrn = {
    id: prnId,
    organisationId: 'org-456',
    accreditationId: 'acc-789',
    tonnage: 100,
    material: 'plastic',
    status: { currentStatus: 'awaiting_authorisation' }
  }

  const nextPrn = {
    id: prnId,
    organisationId: 'org-456',
    accreditationId: 'acc-789',
    tonnage: 100,
    material: 'plastic',
    status: { currentStatus: 'awaiting_acceptance' },
    prnNumber: 'ER2600001'
  }

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

  it('sends audit event to CDP auditing with full previous and next state', async () => {
    const request = createMockRequest()

    await auditPrnStatusTransition(request, prnId, previousPrn, nextPrn)

    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: 'waste-reporting',
        subCategory: 'packaging-recycling-note',
        action: 'status-transition'
      },
      context: {
        prnId,
        previous: previousPrn,
        next: nextPrn
      },
      user: {
        id: userId,
        email: userEmail,
        scope: userScope
      }
    })
  })

  it('records system log with full state', async () => {
    const request = createMockRequest()

    await auditPrnStatusTransition(request, prnId, previousPrn, nextPrn)

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
        previous: previousPrn,
        next: nextPrn
      }
    })
  })

  it('truncates context to just prnId when payload is too large', async () => {
    const request = createMockRequest()

    // Create a large PRN object that exceeds the 1MB audit size limit
    const largePreviousPrn = {
      ...previousPrn,
      largeField: 'x'.repeat(1100000)
    }

    await auditPrnStatusTransition(request, prnId, largePreviousPrn, nextPrn)

    // CDP audit should receive truncated payload
    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: 'waste-reporting',
        subCategory: 'packaging-recycling-note',
        action: 'status-transition'
      },
      context: {
        prnId
      },
      user: {
        id: userId,
        email: userEmail,
        scope: userScope
      }
    })

    // System log should still receive full payload
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        context: {
          prnId,
          previous: largePreviousPrn,
          next: nextPrn
        }
      })
    )
  })
})
