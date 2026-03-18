import { randomBytes } from 'crypto'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  auditOverseasSiteCreate,
  auditOverseasSiteUpdate,
  auditOverseasSiteDelete,
  auditOverseasSiteImport
} from './overseas-sites.js'

const mockAudit = vi.fn()
const mockInsert = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))

const createMockRequest = (overrides = {}) => ({
  systemLogsRepository: {
    insert: mockInsert
  },
  auth: {
    credentials: {
      id: 'user-123',
      email: 'test@defra.gov.uk',
      scope: ['service-maintainer']
    }
  },
  ...overrides
})

const expectedUser = {
  id: 'user-123',
  email: 'test@defra.gov.uk',
  scope: ['service-maintainer']
}

describe('overseas sites auditing', () => {
  const now = new Date('2026-03-18T10:00:00.000Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
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

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          createdAt: now,
          createdBy: expectedUser,
          event: {
            category: 'entity',
            subCategory: 'overseas-sites',
            action: 'create'
          },
          context: { site }
        })
      )
    })
  })

  describe('auditOverseasSiteUpdate', () => {
    it('sends audit event and system log with previous and next state', async () => {
      const siteId = 'site-001'
      const previous = { name: 'Old Name', country: 'India' }
      const next = { name: 'New Name', country: 'India' }

      await auditOverseasSiteUpdate(createMockRequest(), siteId, previous, next)

      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: {
            category: 'entity',
            subCategory: 'overseas-sites',
            action: 'update'
          },
          context: { siteId, previous, next },
          user: expectedUser
        })
      )

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          createdAt: now,
          createdBy: expectedUser,
          event: {
            category: 'entity',
            subCategory: 'overseas-sites',
            action: 'update'
          },
          context: { siteId, previous, next }
        })
      )
    })

    it('omits previous and next from audit event for large payloads', async () => {
      const siteId = 'site-001'
      const veryLongString = randomBytes(1e6).toString('hex')
      const previous = { name: 'Old Name', veryLongString }
      const next = { name: 'New Name', veryLongString }

      await auditOverseasSiteUpdate(createMockRequest(), siteId, previous, next)

      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: {
            category: 'entity',
            subCategory: 'overseas-sites',
            action: 'update'
          },
          context: { siteId }
        })
      )

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          event: {
            category: 'entity',
            subCategory: 'overseas-sites',
            action: 'update'
          },
          context: { siteId, previous, next }
        })
      )
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

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          createdAt: now,
          createdBy: expectedUser,
          event: {
            category: 'entity',
            subCategory: 'overseas-sites',
            action: 'delete'
          },
          context: { siteId, site }
        })
      )
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

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          createdAt: now,
          createdBy: expectedUser,
          event: {
            category: 'entity',
            subCategory: 'overseas-sites',
            action: 'import-initiated'
          },
          context: { importId }
        })
      )
    })
  })
})
