import { auditOrganisationUpdate } from './organisations.js'
import { vi, describe, it, beforeEach, afterEach } from 'vitest'
import { randomBytes } from 'crypto'

const mockAudit = vi.fn()
const mockInsert = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))

describe('auditOrganisationUpdate', () => {
  const now = new Date('2026-01-06T15:47:00.000Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  const organisationId = 'org-id-001'

  const createMockRequest = () => ({
    systemLogsRepository: {
      insert: mockInsert
    }
  })

  describe('large payload handling', () => {
    it('captures context.previous and context.next in both the audit and system log for small payloads', async () => {
      const previous = { version: '1' }
      const next = { version: '2' }

      await auditOrganisationUpdate(
        createMockRequest(),
        organisationId,
        previous,
        next
      )

      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: {
            action: 'update',
            category: 'entity',
            subCategory: 'epr-organisations'
          },
          context: { organisationId, previous, next }
        })
      )

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          event: {
            action: 'update',
            category: 'entity',
            subCategory: 'epr-organisations'
          },
          context: { organisationId, previous, next }
        })
      )
    })

    it('omits context.previous and context.next from the audit event for large payloads', async () => {
      const veryLongString = randomBytes(1e6).toString('hex')
      const previous = { version: '1', veryLongString }
      const next = { version: '2', veryLongString }

      await auditOrganisationUpdate(
        createMockRequest(),
        organisationId,
        previous,
        next
      )

      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: {
            action: 'update',
            category: 'entity',
            subCategory: 'epr-organisations'
          },
          context: { organisationId }
        })
      )

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          event: {
            action: 'update',
            category: 'entity',
            subCategory: 'epr-organisations'
          },
          context: { organisationId, previous, next }
        })
      )
    })
  })
})
