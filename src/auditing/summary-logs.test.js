import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { logger } from '#common/helpers/logging/logger.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'

const mockAudit = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))

const { auditSummaryLogSubmit, auditSummaryLogDownload } =
  await import('./summary-logs.js')

const numbers = {
  organisationNumber: toOrganisationNumber('500001'),
  registrationNumber: toRegistrationNumber('R25SR500030912PA'),
  accreditationNumber: toAccreditationNumber('A25SR500030912PA')
}

describe('auditSummaryLogSubmit', () => {
  const summaryLogId = 'summary-log-123'
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
      ...numbers
    })

    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: 'waste-reporting',
        subCategory: 'summary-log',
        action: 'submit'
      },
      context: {
        summaryLogId,
        ...numbers
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
      ...numbers
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
        ...numbers
      }
    })
  })
})

describe('auditing a summary log under an accreditation with no database id', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('records the accreditation by its number', async () => {
    const systemLogsRepository = createSystemLogsRepository()(logger)
    const request =
      /** @type {import('#common/hapi-types.js').HapiRequest & { systemLogsRepository: import('#repositories/system-logs/port.js').SystemLogsRepository }} */ ({
        auth: {
          credentials: {
            id: 'user',
            email: 'u@example.gov.uk',
            scope: ['standardUser']
          }
        },
        systemLogsRepository
      })

    await auditSummaryLogSubmit(request, {
      summaryLogId: 'summary-log-2027',
      ...numbers
    })

    const { systemLogs } = await systemLogsRepository.find({
      organisationNumber: numbers.organisationNumber,
      limit: 10
    })
    expect(systemLogs[0].context).toMatchObject(numbers)
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining(numbers) })
    )
  })
})

describe('auditSummaryLogDownload', () => {
  const summaryLogId = 'summary-log-123'
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
      ...numbers
    })

    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: 'waste-reporting',
        subCategory: 'summary-log',
        action: 'download'
      },
      context: {
        summaryLogId,
        ...numbers
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
      ...numbers
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
        ...numbers
      }
    })
  })
})
