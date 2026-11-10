import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { logger } from '#common/helpers/logging/logger.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { TEST_ORGANISATION_NUMBER } from '#packaging-recycling-notes/repository/contract/test-data.js'
import { createMockIssuedPrn } from '#packaging-recycling-notes/routes/test-helpers.js'

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

  const nextPrn = createMockIssuedPrn({ id: prnId })

  const previousPrn = createMockIssuedPrn({
    id: prnId,
    prnNumber: null,
    status: {
      ...nextPrn.status,
      currentStatus: PRN_STATUS.AWAITING_AUTHORISATION
    }
  })

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
        organisationNumber: TEST_ORGANISATION_NUMBER,
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
        organisationNumber: TEST_ORGANISATION_NUMBER,
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
        organisationNumber: TEST_ORGANISATION_NUMBER,
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
      organisationNumber: TEST_ORGANISATION_NUMBER,
      prnId,
      previous: largePreviousPrn,
      next: nextPrn
    })
  })
})
