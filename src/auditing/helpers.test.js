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

  it('should call audit with event, user and context from factory', () => {
    const event = {
      category: 'entity',
      subCategory: 'test',
      action: 'create'
    }
    const user = { id: 'user-1' }
    const context = { organisationId: '123' }

    safeAudit({ event, user }, () => context)

    expect(audit).toHaveBeenCalledWith({ event, user, context })
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('should strip context and log warning when factory output makes payload too large', () => {
    const event = {
      category: 'waste-reporting',
      subCategory: 'waste-balance',
      action: 'update'
    }
    const user = { id: 'user-1', email: 'test@example.com' }

    safeAudit({ event, user }, () => ({ largeData: 'x'.repeat(1000) }))

    expect(audit).toHaveBeenCalledWith({ event, user })

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('waste-reporting/waste-balance/update')
      })
    )
  })

  it('should call audit without user when user is not provided', () => {
    const event = {
      category: 'entity',
      subCategory: 'test',
      action: 'create'
    }
    const context = { organisationId: '123' }

    safeAudit({ event }, () => context)

    expect(audit).toHaveBeenCalledWith({ event, context })
  })

  it('should strip context for oversized payload without user', () => {
    const event = {
      category: 'entity',
      subCategory: 'test',
      action: 'create'
    }

    safeAudit({ event }, () => ({ largeData: 'x'.repeat(1000) }))

    expect(audit).toHaveBeenCalledWith({ event })
  })
})
