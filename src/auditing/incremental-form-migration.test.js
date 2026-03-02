import { auditIncrementalFormMigration } from './incremental-form-migration.js'
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

describe('auditIncrementalFormMigration', () => {
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

    await auditIncrementalFormMigration(
      createMockSystemLogsRepository(),
      organisationId,
      previous,
      next
    )

    // Verify CDP audit receives full context
    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: 'entity',
        subCategory: 'epr-organisations',
        action: 'incremental-form-migration'
      },
      context: {
        organisationId,
        previous,
        next
      },
      user: systemUser
    })

    // Verify system log stores full state
    expect(mockInsert).toHaveBeenCalledWith({
      createdAt: now,
      createdBy: systemUser,
      event: {
        category: 'entity',
        subCategory: 'epr-organisations',
        action: 'incremental-form-migration'
      },
      context: {
        organisationId,
        previous,
        next
      }
    })
  })

  it('sends reduced context to CDP audit but full state to system log when payload is too large', async () => {
    // Create a large payload that exceeds the size limit
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

    await auditIncrementalFormMigration(
      createMockSystemLogsRepository(),
      organisationId,
      previous,
      next
    )

    // Verify CDP audit receives reduced context (no previous/next, just organisationId)
    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: 'entity',
        subCategory: 'epr-organisations',
        action: 'incremental-form-migration'
      },
      context: { organisationId },
      user: systemUser
    })

    // Verify system log still stores full state (no size limit)
    expect(mockInsert).toHaveBeenCalledWith({
      createdAt: now,
      createdBy: systemUser,
      event: {
        category: 'entity',
        subCategory: 'epr-organisations',
        action: 'incremental-form-migration'
      },
      context: {
        organisationId,
        previous,
        next
      }
    })
  })
})
