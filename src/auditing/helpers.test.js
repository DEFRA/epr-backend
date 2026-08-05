import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { audit } from '@defra/cdp-auditing'
import { logger } from '#common/helpers/logging/logger.js'
import { invalidArg } from '#test/type-helpers.js'
import { extractUserDetails, safeAudit, recordSystemLogs } from './helpers.js'

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

    safeAudit(invalidArg(payload))

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

    safeAudit(invalidArg(payload))

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

describe('extractUserDetails', () => {
  it('records the role alongside id, email and scope for a human actor', () => {
    const request =
      /** @type {import('#common/hapi-types.js').HapiRequest} */ ({
        auth: {
          credentials: {
            id: 'contact-123',
            email: 'maintainer@example.com',
            scope: ['admin.read', 'admin.dlq.purge'],
            role: 'service_maintainer'
          }
        }
      })

    expect(extractUserDetails(request)).toEqual({
      id: 'contact-123',
      email: 'maintainer@example.com',
      scope: ['admin.read', 'admin.dlq.purge'],
      role: 'service_maintainer'
    })
  })

  it('records a null role for a human actor with no resolved role', () => {
    const request =
      /** @type {import('#common/hapi-types.js').HapiRequest} */ ({
        auth: {
          credentials: {
            id: 'contact-456',
            email: 'operator@example.com',
            scope: ['some-scope'],
            role: null
          }
        }
      })

    expect(extractUserDetails(request)).toEqual({
      id: 'contact-456',
      email: 'operator@example.com',
      scope: ['some-scope'],
      role: null
    })
  })

  it('does not record a role for a machine actor', () => {
    const request =
      /** @type {import('#common/hapi-types.js').HapiRequest} */ ({
        auth: {
          credentials: {
            id: 'machine-1',
            isMachine: true,
            name: 'batch-job'
          }
        }
      })

    expect(extractUserDetails(request)).toEqual({
      id: 'machine-1',
      name: 'batch-job'
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
    const repository =
      /** @type {import('#repositories/system-logs/port.js').SystemLogsRepository} */ (
        /** @type {unknown} */ ({
          insert: mockInsert,
          insertMany: mockInsertMany
        })
      )
    const payload = buildPayload(1)

    await recordSystemLogs(repository, [invalidArg(payload)])

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
})
