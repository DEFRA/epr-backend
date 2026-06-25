import { auditOrganisationUpdate } from './organisations.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { logger } from '#common/helpers/logging/logger.js'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'
import { randomBytes } from 'crypto'

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
    /** @type {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: import('#repositories/system-logs/port.js').SystemLogsRepository}} */ ({
      systemLogsRepository
    })

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
    it('records context.previous and context.next in both the audit and the stored system log for small payloads', async () => {
      const previous = { version: '1' }
      const next = { version: '2' }

      await auditOrganisationUpdate(
        createRequest(),
        organisationId,
        previous,
        next
      )

      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expectedEvent,
          context: { organisationId, previous, next }
        })
      )

      const storedLogs = await findStoredLogs()
      expect(storedLogs).toHaveLength(1)
      expect(storedLogs[0].event).toEqual(expectedEvent)
      expect(storedLogs[0].context).toEqual({ organisationId, previous, next })
      expect(storedLogs[0].createdAt).toEqual(now)
    })

    it('omits context.previous and context.next from the audit event but keeps them in the stored system log for large payloads', async () => {
      const veryLongString = randomBytes(1e6).toString('hex')
      const previous = { version: '1', veryLongString }
      const next = { version: '2', veryLongString }

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
      expect(storedLogs[0].context).toEqual({ organisationId, previous, next })
    })
  })
})
