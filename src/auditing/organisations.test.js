import { auditOrganisationUpdate } from './organisations.js'
import { vi, describe, it, beforeEach, afterEach } from 'vitest'

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
    it('sends cherry-picked context to CDP audit and full context to system log', async () => {
      const previous = {
        status: 'created',
        version: 1,
        registrations: [{ id: 'reg-1' }],
        accreditations: [{ id: 'acc-1' }, { id: 'acc-2' }]
      }
      const next = {
        status: 'approved',
        version: 2,
        registrations: [{ id: 'reg-1' }],
        accreditations: [{ id: 'acc-1' }, { id: 'acc-2' }]
      }

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
          context: {
            organisationId,
            previous: {
              status: 'created',
              version: 1,
              registrationCount: 1,
              accreditationCount: 2
            },
            next: {
              status: 'approved',
              version: 2,
              registrationCount: 1,
              accreditationCount: 2
            }
          }
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
