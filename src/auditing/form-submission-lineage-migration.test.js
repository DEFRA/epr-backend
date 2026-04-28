import { auditFormSubmissionLineageMigration } from './form-submission-lineage-migration.js'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'
import { ObjectId } from 'mongodb'

const mockAudit = vi.fn()
const mockInsert = vi.fn()

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

describe('auditFormSubmissionLineageMigration', () => {
  const now = new Date('2026-02-11T12:00:00.000Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  const organisationId = new ObjectId().toString()
  const systemUser = { id: 'system', email: 'system', scope: [] }

  const createMockSystemLogsRepository = () => ({
    insert: mockInsert
  })

  it('logs full previous/next state to both CDP audit and system log', async () => {
    const previous = {
      registrations: [
        { id: new ObjectId().toString(), registrationNumber: 'REG-2025-01' }
      ],
      accreditations: [
        { id: new ObjectId().toString(), accreditationNumber: 'ACC-2025-01' }
      ]
    }
    const next = {
      registrations: [
        { id: new ObjectId().toString(), registrationNumber: 'REG-2025-01' },
        { id: new ObjectId().toString(), registrationNumber: 'REG-2025-02' }
      ],
      accreditations: [
        { id: new ObjectId().toString(), accreditationNumber: 'ACC-2025-01' },
        { id: new ObjectId().toString(), accreditationNumber: 'ACC-2025-02' }
      ]
    }

    await auditFormSubmissionLineageMigration(
      createMockSystemLogsRepository(),
      organisationId,
      previous,
      next
    )

    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: 'entity',
        subCategory: 'epr-organisations',
        action: 'migrate-form-submission-lineage'
      },
      context: {
        organisationId,
        previous,
        next
      },
      user: systemUser
    })

    expect(mockInsert).toHaveBeenCalledWith({
      createdAt: now,
      createdBy: systemUser,
      event: {
        category: 'entity',
        subCategory: 'epr-organisations',
        action: 'migrate-form-submission-lineage'
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
          registrationNumber: 'REG-2025-01',
          data: largeData
        }
      ],
      accreditations: []
    }
    const next = {
      registrations: [
        {
          id: new ObjectId().toString(),
          registrationNumber: 'REG-2025-01',
          data: largeData
        },
        {
          id: new ObjectId().toString(),
          registrationNumber: 'REG-2025-02',
          data: largeData
        }
      ],
      accreditations: []
    }

    await auditFormSubmissionLineageMigration(
      createMockSystemLogsRepository(),
      organisationId,
      previous,
      next
    )

    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: 'entity',
        subCategory: 'epr-organisations',
        action: 'migrate-form-submission-lineage'
      },
      context: { organisationId },
      user: systemUser
    })

    expect(mockInsert).toHaveBeenCalledWith({
      createdAt: now,
      createdBy: systemUser,
      event: {
        category: 'entity',
        subCategory: 'epr-organisations',
        action: 'migrate-form-submission-lineage'
      },
      context: {
        organisationId,
        previous,
        next
      }
    })
  })
})
