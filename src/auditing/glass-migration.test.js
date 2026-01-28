import { auditGlassMigration } from './glass-migration.js'
import { vi, describe, it, beforeEach, afterEach } from 'vitest'

const mockAudit = vi.fn()
const mockInsert = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))

describe('auditGlassMigration', () => {
  const now = new Date('2026-01-28T12:00:00.000Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  const organisationId = 'org-123'

  const createMockSystemLogsRepository = () => ({
    insert: mockInsert
  })

  it('records audit event with glass-migration category and migrate action', async () => {
    const previous = {
      registrations: [{ registrationNumber: 'REG-2025-GL' }]
    }
    const next = {
      registrations: [{ registrationNumber: 'REG-2025-GR' }]
    }

    await auditGlassMigration(
      createMockSystemLogsRepository(),
      organisationId,
      previous,
      next
    )

    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: 'entity',
        subCategory: 'epr-organisations',
        action: 'glass-migration'
      },
      context: { organisationId, previous, next },
      user: { id: 'system', email: 'system', scope: [] }
    })
  })

  it('records system log with createdAt and createdBy fields', async () => {
    const previous = {
      registrations: [{ registrationNumber: 'REG-2025-GL' }]
    }
    const next = {
      registrations: [{ registrationNumber: 'REG-2025-GR' }]
    }

    await auditGlassMigration(
      createMockSystemLogsRepository(),
      organisationId,
      previous,
      next
    )

    expect(mockInsert).toHaveBeenCalledWith({
      createdAt: now,
      createdBy: { id: 'system', email: 'system', scope: [] },
      event: {
        category: 'entity',
        subCategory: 'epr-organisations',
        action: 'glass-migration'
      },
      context: { organisationId, previous, next }
    })
  })
})
