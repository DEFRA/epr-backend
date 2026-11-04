import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  auditOverseasSiteCreate,
  auditOverseasSiteDelete,
  auditOverseasSiteImport
} from './auditing.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { logger } from '#common/helpers/logging/logger.js'

const mockAudit = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))

const expectedUser = {
  id: 'user-123',
  email: 'test@defra.gov.uk',
  scope: ['service-maintainer']
}

describe('overseas sites auditing', () => {
  const now = new Date('2026-03-18T10:00:00.000Z')

  let systemLogsRepository

  const createMockRequest = (overrides = {}) =>
    /** @type {import('#common/hapi-types.js').HapiRequest & { systemLogsRepository: import('#repositories/system-logs/port.js').SystemLogsRepository }} */ ({
      systemLogsRepository,
      auth: {
        credentials: {
          id: 'user-123',
          email: 'test@defra.gov.uk',
          scope: ['service-maintainer']
        }
      },
      ...overrides
    })

  const findStoredLog = async () => {
    const { systemLogs } = await systemLogsRepository.find({ limit: 10 })
    return systemLogs[0]
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    systemLogsRepository = createSystemLogsRepository()(logger)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('auditOverseasSiteCreate', () => {
    it('sends audit event and system log for site creation', async () => {
      const site = { id: 'site-001', name: 'Mumbai Plant', country: 'India' }

      await auditOverseasSiteCreate(createMockRequest(), site)

      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: {
            category: 'entity',
            subCategory: 'overseas-sites',
            action: 'create'
          },
          context: { site },
          user: expectedUser
        })
      )

      const storedLog = await findStoredLog()
      expect(storedLog).toEqual({
        createdAt: now,
        createdBy: expectedUser,
        event: {
          category: 'entity',
          subCategory: 'overseas-sites',
          action: 'create'
        },
        context: { site }
      })
    })
  })

  describe('auditOverseasSiteDelete', () => {
    it('sends audit event and system log with deleted site record', async () => {
      const siteId = 'site-001'
      const site = { id: siteId, name: 'Mumbai Plant', country: 'India' }

      await auditOverseasSiteDelete(createMockRequest(), siteId, site)

      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: {
            category: 'entity',
            subCategory: 'overseas-sites',
            action: 'delete'
          },
          context: { siteId, site },
          user: expectedUser
        })
      )

      const storedLog = await findStoredLog()
      expect(storedLog).toEqual({
        createdAt: now,
        createdBy: expectedUser,
        event: {
          category: 'entity',
          subCategory: 'overseas-sites',
          action: 'delete'
        },
        context: { siteId, site }
      })
    })
  })

  describe('auditOverseasSiteImport', () => {
    it('sends audit event and system log for import initiation', async () => {
      const importId = 'import-001'

      await auditOverseasSiteImport(createMockRequest(), importId)

      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: {
            category: 'entity',
            subCategory: 'overseas-sites',
            action: 'import-initiated'
          },
          context: { importId },
          user: expectedUser
        })
      )

      const storedLog = await findStoredLog()
      expect(storedLog).toEqual({
        createdAt: now,
        createdBy: expectedUser,
        event: {
          category: 'entity',
          subCategory: 'overseas-sites',
          action: 'import-initiated'
        },
        context: { importId }
      })
    })
  })
})
