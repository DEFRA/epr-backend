import { afterAll, afterEach, beforeEach, describe, vi } from 'vitest'
import { auditOrganisationUpdate } from './index.js'
import { randomUUID } from 'crypto'

const mockCdpAuditing = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockCdpAuditing(...args)
}))

describe('auditing', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date())
  })
  afterEach(() => {
    vi.useRealTimers()
  })
  afterAll(() => {
    vi.resetAllMocks()
  })

  describe('auditOrganisationUpdate', () => {
    it('writes payload to CDP auditing helper and system log', async () => {
      const organisationId = randomUUID()

      const mockSystemLogsRepository = {
        insert: vi.fn()
      }

      const request = { systemLogsRepository: mockSystemLogsRepository }
      const auditInfo = { organisationId, details: {} }
      await auditOrganisationUpdate(request, auditInfo)

      const expectedPayload = {
        event: {
          action: 'update',
          category: 'organisation'
        },
        context: {
          user: undefined,
          organisationId,
          ...auditInfo.details
        }
      }

      expect(mockCdpAuditing).toHaveBeenCalledWith(expectedPayload)
      expect(mockSystemLogsRepository.insert).toHaveBeenCalledWith({
        createdAt: new Date(),
        ...expectedPayload
      })
    })
  })
})
