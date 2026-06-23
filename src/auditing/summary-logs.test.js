import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { logger } from '#common/helpers/logging/logger.js'

const mockAudit = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))

const { auditSummaryLogSubmit, auditSummaryLogDownload } =
  await import('./summary-logs.js')

describe('auditSummaryLogSubmit', () => {
  const summaryLogId = 'summary-log-123'
  const organisationId = 'org-456'
  const registrationId = 'reg-789'
  const userId = 'user-abc'
  const userEmail = 'test@example.gov.uk'
  const userScope = ['standardUser']

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

describe('auditSummaryLogDownload', () => {
  const summaryLogId = 'summary-log-123'
  const organisationId = 'org-456'
  const registrationId = 'reg-789'
  const userId = 'user-abc'
  const userEmail = 'test@example.gov.uk'
  const userScope = ['serviceMaintainer']

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

  it('sends audit event with download action', async () => {
    const request = createMockRequest()

    await auditSummaryLogDownload(request, {
      summaryLogId,
      organisationId,
      registrationId
    })

    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: 'waste-reporting',
        subCategory: 'summary-log',
        action: 'download'
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

  it('records system log with download action', async () => {
    const request = createMockRequest()

    await auditSummaryLogDownload(request, {
      summaryLogId,
      organisationId,
      registrationId
    })

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
        subCategory: 'summary-log',
        action: 'download'
      },
      context: {
        summaryLogId,
        organisationId,
        registrationId
      }
    })
  })
})
