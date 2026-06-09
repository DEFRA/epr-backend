import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { logger } from '#common/helpers/logging/logger.js'

const mockAudit = vi.fn()

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
    organisation: { id: 'org-456', name: 'Test Organisation' },
    accreditation: { id: 'acc-789', material: 'plastic' },
    tonnage: 100,
    status: { currentStatus: 'awaiting_acceptance' },
    prnNumber: 'ER2600001'
  }

  let systemLogsRepository

  const createMockRequest = () =>
    /** @type {import('#common/hapi-types.js').HapiRequest & { systemLogsRepository: import('#repositories/system-logs/port.js').SystemLogsRepository }} */ ({
      auth: {
        credentials: {
          id: userId,
          email: userEmail,
          scope: userScope
        }
      },
      systemLogsRepository
    })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-12-22T10:00:00.000Z'))
    systemLogsRepository = createSystemLogsRepository()(logger)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  const findStoredLog = async () => {
    const { systemLogs } = await systemLogsRepository.find({ limit: 10 })
    return systemLogs[0]
  }

  it('sends audit event to CDP auditing with full previous and next state', async () => {
    const request = createMockRequest()

    await auditPrnStatusTransition(request, prnId, previousPrn, nextPrn)

    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: 'waste-reporting',
        subCategory: 'packaging-recycling-notes',
        action: 'status-transition'
      },
      context: {
        organisationId: 'org-456',
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

    const storedLog = await findStoredLog()
    expect(storedLog).toEqual({
      createdAt: new Date('2025-12-22T10:00:00.000Z'),
      createdBy: {
        id: userId,
        email: userEmail,
        scope: userScope
      },
      event: {
        category: 'waste-reporting',
        subCategory: 'packaging-recycling-notes',
        action: 'status-transition'
      },
      context: {
        organisationId: 'org-456',
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
        subCategory: 'packaging-recycling-notes',
        action: 'status-transition'
      },
      context: {
        organisationId: 'org-456',
        prnId
      },
      user: {
        id: userId,
        email: userEmail,
        scope: userScope
      }
    })

    // System log should still receive full payload
    const storedLog = await findStoredLog()
    expect(storedLog.context).toEqual({
      organisationId: 'org-456',
      prnId,
      previous: largePreviousPrn,
      next: nextPrn
    })
  })
})
