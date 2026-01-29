import { auditGlassMigration } from './glass-migration.js'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'

const mockAudit = vi.fn()
const mockInsert = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
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
  const systemUser = { id: 'system', email: 'system', scope: [] }

  const createMockSystemLogsRepository = () => ({
    insert: mockInsert
  })

  describe('CDP audit', () => {
    it('logs full previous/next state', async () => {
      const previous = {
        registrations: [{ id: 'reg-1', registrationNumber: 'REG-2025-GL' }],
        accreditations: []
      }
      const next = {
        registrations: [{ id: 'reg-1', registrationNumber: 'REG-2025-GR' }],
        accreditations: []
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
        context: {
          organisationId,
          previous,
          next
        },
        user: systemUser
      })
    })

    it('sends reduced context when payload is too large', async () => {
      // Create a large payload that exceeds the size limit
      const largeData = 'x'.repeat(15000)
      const previous = {
        registrations: [
          { id: 'reg-1', registrationNumber: 'REG-2025-GL', data: largeData }
        ],
        accreditations: []
      }
      const next = {
        registrations: [
          { id: 'reg-1', registrationNumber: 'REG-2025-GR', data: largeData }
        ],
        accreditations: []
      }

      await auditGlassMigration(
        createMockSystemLogsRepository(),
        organisationId,
        previous,
        next
      )

      // CDP audit should get reduced context
      expect(mockAudit).toHaveBeenCalledWith({
        event: {
          category: 'entity',
          subCategory: 'epr-organisations',
          action: 'glass-migration'
        },
        context: { organisationId },
        user: systemUser
      })
    })
  })

  describe('system log', () => {
    it('always stores full previous/next state', async () => {
      const previous = {
        registrations: [{ id: 'reg-1', registrationNumber: 'REG-2025-GL' }],
        accreditations: [{ id: 'acc-1', accreditationNumber: 'ACC-2025-GL' }]
      }
      const next = {
        registrations: [{ id: 'reg-1', registrationNumber: 'REG-2025-GR' }],
        accreditations: [{ id: 'acc-1', accreditationNumber: 'ACC-2025-GO' }]
      }

      await auditGlassMigration(
        createMockSystemLogsRepository(),
        organisationId,
        previous,
        next
      )

      expect(mockInsert).toHaveBeenCalledWith({
        createdAt: now,
        createdBy: systemUser,
        event: {
          category: 'entity',
          subCategory: 'epr-organisations',
          action: 'glass-migration'
        },
        context: {
          organisationId,
          previous,
          next
        }
      })
    })

    it('stores full state even when payload is too large for CDP audit', async () => {
      const largeData = 'x'.repeat(15000)
      const previous = {
        registrations: [
          { id: 'reg-1', registrationNumber: 'REG-2025-GL', data: largeData }
        ],
        accreditations: []
      }
      const next = {
        registrations: [
          { id: 'reg-1', registrationNumber: 'REG-2025-GR', data: largeData }
        ],
        accreditations: []
      }

      await auditGlassMigration(
        createMockSystemLogsRepository(),
        organisationId,
        previous,
        next
      )

      // System log should still get full context
      expect(mockInsert).toHaveBeenCalledWith({
        createdAt: now,
        createdBy: systemUser,
        event: {
          category: 'entity',
          subCategory: 'epr-organisations',
          action: 'glass-migration'
        },
        context: {
          organisationId,
          previous,
          next
        }
      })
    })
  })
})
