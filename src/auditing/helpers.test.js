import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { audit } from '@defra/cdp-auditing'
import { logger } from '#common/helpers/logging/logger.js'
import { safeAudit, recordSystemLogs } from './helpers.js'

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

describe('recordSystemLogs', () => {
  const mockInsert = vi.fn()
  const mockInsertMany = vi.fn()

  const buildPayload = (id) => ({
    user: { id: `user-${id}`, email: `user${id}@example.com`, scope: [] },
    event: { category: 'test', subCategory: 'test', action: 'test' },
    context: { id }
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockInsert.mockResolvedValue(undefined)
    mockInsertMany.mockResolvedValue(undefined)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-06-01T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls insertMany when the repository supports it', async () => {
    const repository = { insert: mockInsert, insertMany: mockInsertMany }
    const payload = buildPayload(1)

    await recordSystemLogs(repository, [payload])

    expect(mockInsertMany).toHaveBeenCalledExactlyOnceWith([
      {
        createdAt: new Date('2025-06-01T12:00:00.000Z'),
        createdBy: payload.user,
        event: payload.event,
        context: payload.context
      }
    ])
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('falls back to individual inserts when insertMany is absent', async () => {
    const repository = { insert: mockInsert }
    const payloads = [buildPayload(1), buildPayload(2)]

    await recordSystemLogs(repository, payloads)

    expect(mockInsert).toHaveBeenCalledTimes(2)
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: payloads[0].user })
    )
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: payloads[1].user })
    )
  })
})
