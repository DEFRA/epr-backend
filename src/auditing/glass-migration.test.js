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

  describe('registration rename (GL to GR)', () => {
    it('logs the registration number change', async () => {
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
          registrations: [
            { id: 'reg-1', from: 'REG-2025-GL', to: 'REG-2025-GR' }
          ],
          accreditations: []
        },
        user: { id: 'system', email: 'system', scope: [] }
      })
    })
  })

  describe('registration split (GL to GR + GO)', () => {
    it('logs both new registration numbers', async () => {
      const previous = {
        registrations: [{ id: 'reg-1', registrationNumber: 'REG-2025-GL' }],
        accreditations: []
      }
      const next = {
        registrations: [
          { id: 'reg-1', registrationNumber: 'REG-2025-GR' },
          { id: 'reg-2', registrationNumber: 'REG-2025-GO' }
        ],
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
          registrations: [
            {
              id: 'reg-1',
              from: 'REG-2025-GL',
              to: ['REG-2025-GR', 'REG-2025-GO']
            }
          ],
          accreditations: []
        },
        user: { id: 'system', email: 'system', scope: [] }
      })
    })
  })

  describe('accreditation rename', () => {
    it('logs the accreditation number change', async () => {
      const previous = {
        registrations: [],
        accreditations: [{ id: 'acc-1', accreditationNumber: 'ACC-2025-GL' }]
      }
      const next = {
        registrations: [],
        accreditations: [{ id: 'acc-1', accreditationNumber: 'ACC-2025-GO' }]
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
          registrations: [],
          accreditations: [
            { id: 'acc-1', from: 'ACC-2025-GL', to: 'ACC-2025-GO' }
          ]
        },
        user: { id: 'system', email: 'system', scope: [] }
      })
    })
  })

  describe('system log insertion', () => {
    it('records with createdAt and createdBy fields', async () => {
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

      expect(mockInsert).toHaveBeenCalledWith({
        createdAt: now,
        createdBy: { id: 'system', email: 'system', scope: [] },
        event: {
          category: 'entity',
          subCategory: 'epr-organisations',
          action: 'glass-migration'
        },
        context: {
          organisationId,
          registrations: [
            { id: 'reg-1', from: 'REG-2025-GL', to: 'REG-2025-GR' }
          ],
          accreditations: []
        }
      })
    })
  })

  describe('non-glass registrations', () => {
    it('ignores registrations without GL suffix', async () => {
      const previous = {
        registrations: [
          { id: 'reg-1', registrationNumber: 'REG-2025-GL' },
          { id: 'reg-2', registrationNumber: 'REG-2025-PA' }
        ],
        accreditations: []
      }
      const next = {
        registrations: [
          { id: 'reg-1', registrationNumber: 'REG-2025-GR' },
          { id: 'reg-2', registrationNumber: 'REG-2025-PA' }
        ],
        accreditations: []
      }

      await auditGlassMigration(
        createMockSystemLogsRepository(),
        organisationId,
        previous,
        next
      )

      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            registrations: [
              { id: 'reg-1', from: 'REG-2025-GL', to: 'REG-2025-GR' }
            ]
          })
        })
      )
    })
  })

  describe('accreditation split (GL to GR + GO)', () => {
    it('logs both new accreditation numbers', async () => {
      const previous = {
        registrations: [],
        accreditations: [{ id: 'acc-1', accreditationNumber: 'ACC-2025-GL' }]
      }
      const next = {
        registrations: [],
        accreditations: [
          { id: 'acc-1', accreditationNumber: 'ACC-2025-GR' },
          { id: 'acc-2', accreditationNumber: 'ACC-2025-GO' }
        ]
      }

      await auditGlassMigration(
        createMockSystemLogsRepository(),
        organisationId,
        previous,
        next
      )

      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            accreditations: [
              {
                id: 'acc-1',
                from: 'ACC-2025-GL',
                to: ['ACC-2025-GR', 'ACC-2025-GO']
              }
            ]
          })
        })
      )
    })
  })

  describe('non-glass accreditations', () => {
    it('ignores accreditations without GL suffix', async () => {
      const previous = {
        registrations: [],
        accreditations: [
          { id: 'acc-1', accreditationNumber: 'ACC-2025-GL' },
          { id: 'acc-2', accreditationNumber: 'ACC-2025-PA' }
        ]
      }
      const next = {
        registrations: [],
        accreditations: [
          { id: 'acc-1', accreditationNumber: 'ACC-2025-GO' },
          { id: 'acc-2', accreditationNumber: 'ACC-2025-PA' }
        ]
      }

      await auditGlassMigration(
        createMockSystemLogsRepository(),
        organisationId,
        previous,
        next
      )

      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            accreditations: [
              { id: 'acc-1', from: 'ACC-2025-GL', to: 'ACC-2025-GO' }
            ]
          })
        })
      )
    })
  })

  describe('edge cases', () => {
    it('ignores GL registration with no matching GR/GO in migrated data', async () => {
      const previous = {
        registrations: [{ id: 'reg-1', registrationNumber: 'REG-2025-GL' }],
        accreditations: []
      }
      // Migration somehow didn't produce a GR/GO version
      const next = {
        registrations: [],
        accreditations: []
      }

      await auditGlassMigration(
        createMockSystemLogsRepository(),
        organisationId,
        previous,
        next
      )

      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            registrations: [],
            accreditations: []
          })
        })
      )
    })

    it('ignores GL accreditation with no matching GR/GO in migrated data', async () => {
      const previous = {
        registrations: [],
        accreditations: [{ id: 'acc-1', accreditationNumber: 'ACC-2025-GL' }]
      }
      // Migration somehow didn't produce a GR/GO version
      const next = {
        registrations: [],
        accreditations: []
      }

      await auditGlassMigration(
        createMockSystemLogsRepository(),
        organisationId,
        previous,
        next
      )

      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            registrations: [],
            accreditations: []
          })
        })
      )
    })
  })

  describe('empty or undefined arrays', () => {
    it('handles undefined registrations', async () => {
      const previous = { accreditations: [] }
      const next = { accreditations: [] }

      await auditGlassMigration(
        createMockSystemLogsRepository(),
        organisationId,
        previous,
        next
      )

      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            registrations: [],
            accreditations: []
          })
        })
      )
    })

    it('handles undefined accreditations', async () => {
      const previous = { registrations: [] }
      const next = { registrations: [] }

      await auditGlassMigration(
        createMockSystemLogsRepository(),
        organisationId,
        previous,
        next
      )

      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            registrations: [],
            accreditations: []
          })
        })
      )
    })
  })
})
