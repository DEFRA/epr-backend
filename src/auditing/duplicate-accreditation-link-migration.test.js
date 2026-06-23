import { auditDuplicateAccreditationLinkMigration } from './duplicate-accreditation-link-migration.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { logger } from '#common/helpers/logging/logger.js'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'
import { ObjectId } from 'mongodb'

const mockAudit = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    warn: vi.fn()
  }
}))

vi.mock('#root/config.js', () => ({
  config: {
    get: vi.fn((key) => {
      if (key === 'audit.maxPayloadSizeBytes') {
        return 10000
      }
      return undefined
    })
  }
}))

describe('auditDuplicateAccreditationLinkMigration', () => {
  const now = new Date('2026-02-11T12:00:00.000Z')

  let systemLogsRepository

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    systemLogsRepository = createSystemLogsRepository()(logger)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  const organisationId = new ObjectId().toString()
  const systemUser = { id: 'system', email: 'system', scope: [], role: null }

  const findStoredLog = async () => {
    const { systemLogs } = await systemLogsRepository.find({ limit: 10 })
    return systemLogs[0]
  }

  it('logs full previous/next state to both CDP audit and system log', async () => {
    const previous = {
      registrations: [
        { id: new ObjectId().toString(), accreditationId: 'acc-1' },
        { id: new ObjectId().toString(), accreditationId: 'acc-1' }
      ]
    }
    const next = {
      registrations: [
        { id: previous.registrations[0].id, accreditationId: 'acc-1' },
        { id: previous.registrations[1].id }
      ]
    }

    await auditDuplicateAccreditationLinkMigration(
      systemLogsRepository,
      organisationId,
      previous,
      next
    )

    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: 'entity',
        subCategory: 'epr-organisations',
        action: 'duplicate-accreditation-link-migration'
      },
      context: {
        organisationId,
        previous,
        next
      },
      user: systemUser
    })

    const storedLog = await findStoredLog()
    expect(storedLog).toEqual({
      createdAt: now,
      createdBy: systemUser,
      event: {
        category: 'entity',
        subCategory: 'epr-organisations',
        action: 'duplicate-accreditation-link-migration'
      },
      context: {
        organisationId,
        previous,
        next
      }
    })
  })

  it('sends reduced context to CDP audit but full state to system log when payload is too large', async () => {
    const largeData = 'x'.repeat(15000)
    const previous = {
      registrations: [
        {
          id: new ObjectId().toString(),
          accreditationId: 'acc-1',
          data: largeData
        },
        {
          id: new ObjectId().toString(),
          accreditationId: 'acc-1',
          data: largeData
        }
      ]
    }
    const next = {
      registrations: [
        {
          id: previous.registrations[0].id,
          accreditationId: 'acc-1',
          data: largeData
        },
        { id: previous.registrations[1].id, data: largeData }
      ]
    }

    await auditDuplicateAccreditationLinkMigration(
      systemLogsRepository,
      organisationId,
      previous,
      next
    )

    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: 'entity',
        subCategory: 'epr-organisations',
        action: 'duplicate-accreditation-link-migration'
      },
      context: { organisationId },
      user: systemUser
    })

    const storedLog = await findStoredLog()
    expect(storedLog).toEqual({
      createdAt: now,
      createdBy: systemUser,
      event: {
        category: 'entity',
        subCategory: 'epr-organisations',
        action: 'duplicate-accreditation-link-migration'
      },
      context: {
        organisationId,
        previous,
        next
      }
    })
  })
})
