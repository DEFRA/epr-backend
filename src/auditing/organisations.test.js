import { toOrganisationNumber } from '#domain/organisations/numbers.js'
import { auditOrganisationUpdate } from './organisations.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { logger } from '#common/helpers/logging/logger.js'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'
import { randomBytes } from 'crypto'

/**
 * @import { HapiRequest } from '#common/hapi-types.js'
 * @import { SystemLogsRepository } from '#repositories/system-logs/port.js'
 */

const mockAudit = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))

describe('auditOrganisationUpdate', () => {
  const now = new Date('2026-01-06T15:47:00.000Z')
  const organisationId = 'org-id-001'

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

  const createRequest = () =>
    /** @type {HapiRequest & { systemLogsRepository: SystemLogsRepository }} */ (
      /** @type {unknown} */ ({
        systemLogsRepository,
        auth: {
          credentials: {
            id: 'user-1',
            email: 'user@example.com',
            scope: [],
            role: null
          }
        }
      })
    )

  const findStoredLogs = async () => {
    const { systemLogs } = await systemLogsRepository.find({
      organisationId,
      limit: 10
    })
    return systemLogs
  }

  const expectedEvent = {
    action: 'update',
    category: 'entity',
    subCategory: 'epr-organisations'
  }

  describe('large payload handling', () => {
    const organisationNumber = toOrganisationNumber('500001')
    it('records context.previous and context.next in both the audit and the stored system log for small payloads', async () => {
      const previous = { version: '1', organisationNumber }
      const next = { version: '2', organisationNumber }

      await auditOrganisationUpdate(
        createRequest(),
        organisationId,
        previous,
        next
      )

      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expectedEvent,
          context: {
            organisationId,
            previous: { version: '1', orgId: 500001 },
            next: { version: '2', orgId: 500001 }
          }
        })
      )

      const storedLogs = await findStoredLogs()
      expect(storedLogs).toHaveLength(1)
      expect(storedLogs[0].event).toEqual(expectedEvent)
      expect(storedLogs[0].context).toEqual({
        organisationId,
        previous: { version: '1', orgId: 500001 },
        next: { version: '2', orgId: 500001 }
      })
      expect(storedLogs[0].createdAt).toEqual(now)
    })

    it('omits context.previous and context.next from the audit event but keeps them in the stored system log for large payloads', async () => {
      const veryLongString = randomBytes(1e6).toString('hex')
      const previous = { version: '1', veryLongString, organisationNumber }
      const next = { version: '2', veryLongString, organisationNumber }

      await auditOrganisationUpdate(
        createRequest(),
        organisationId,
        previous,
        next
      )

      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expectedEvent,
          context: { organisationId }
        })
      )

      const storedLogs = await findStoredLogs()
      expect(storedLogs).toHaveLength(1)
      expect(storedLogs[0].event).toEqual(expectedEvent)
      expect(storedLogs[0].context).toEqual({
        organisationId,
        previous: { version: '1', veryLongString, orgId: 500001 },
        next: { version: '2', veryLongString, orgId: 500001 }
      })
    })
  })
})
