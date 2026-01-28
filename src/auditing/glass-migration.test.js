import { auditGlassMigration } from './glass-migration.js'
import { vi, describe, it, beforeEach, afterEach } from 'vitest'
import { randomBytes } from 'crypto'

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

  describe('small payloads', () => {
    it('includes full context in CDP audit event', async () => {
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

    it('includes full context in system log', async () => {
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

  describe('large payloads', () => {
    it('omits previous and next from CDP audit event', async () => {
      const veryLongString = randomBytes(1e6).toString('hex')
      const previous = { registrations: [{ data: veryLongString }] }
      const next = { registrations: [{ data: veryLongString }] }

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
        context: { organisationId },
        user: { id: 'system', email: 'system', scope: [] }
      })
    })

    it('still includes full context in system log', async () => {
      const veryLongString = randomBytes(1e6).toString('hex')
      const previous = { registrations: [{ data: veryLongString }] }
      const next = { registrations: [{ data: veryLongString }] }

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
})
