import { describe, it, expect, vi, beforeEach } from 'vitest'
import { audit } from '@defra/cdp-auditing'
import { logger } from '#common/helpers/logging/logger.js'
import { safeAudit } from './helpers.js'

vi.mock('@defra/cdp-auditing', () => ({
  audit: vi.fn()
}))

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    warn: vi.fn()
  }
}))

vi.mock('#root/config.js', () => ({
  config: {
    get: vi.fn((key) => {
      if (key === 'audit.maxPayloadSizeBytes') {
        return 500
      }
      return undefined
    })
  }
}))

describe('safeAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should pass through small payloads to audit unchanged', () => {
    const payload = {
      event: {
        category: 'entity',
        subCategory: 'test',
        action: 'create'
      },
      context: { id: '123' },
      user: { id: 'user-1' }
    }

    safeAudit(payload)

    expect(audit).toHaveBeenCalledWith(payload)
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('should strip context and log warning for oversized payloads', () => {
    const payload = {
      event: {
        category: 'waste-reporting',
        subCategory: 'waste-balance',
        action: 'update'
      },
      context: {
        largeData: 'x'.repeat(1000)
      },
      user: { id: 'user-1', email: 'test@example.com' }
    }

    safeAudit(payload)

    expect(audit).toHaveBeenCalledWith({
      event: payload.event,
      user: payload.user
    })

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('waste-reporting/waste-balance/update')
      })
    )
  })

  it('should handle payloads without a user field', () => {
    const payload = {
      event: {
        category: 'entity',
        subCategory: 'test',
        action: 'create'
      },
      context: { id: '123' }
    }

    safeAudit(payload)

    expect(audit).toHaveBeenCalledWith(payload)
  })

  it('should handle oversized payloads without a user field', () => {
    const payload = {
      event: {
        category: 'entity',
        subCategory: 'test',
        action: 'create'
      },
      context: {
        largeData: 'x'.repeat(1000)
      }
    }

    safeAudit(payload)

    expect(audit).toHaveBeenCalledWith({
      event: payload.event
    })
  })
})
