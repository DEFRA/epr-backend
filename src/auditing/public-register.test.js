import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const mockAudit = vi.fn()
const mockInsert = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))

const { auditPublicRegisterGenerate } = await import('./public-register.js')

describe('auditPublicRegisterGenerate', () => {
  const url = 'https://example.com/public-register.csv'
  const generatedAt = '2025-12-22T10:00:00.000Z'
  const expiresAt = '2025-12-22T11:00:00.000Z'
  const userId = 'user-abc'
  const userEmail = 'test@example.gov.uk'
  const userScope = ['service_maintainer']

  const createMockRequest = () => ({
    auth: {
      credentials: {
        id: userId,
        email: userEmail,
        scope: userScope
      }
    },
    systemLogsRepository: {
      insert: mockInsert
    }
  })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-12-22T10:00:00.000Z'))
    mockInsert.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('sends audit event to CDP auditing with correct payload', async () => {
    const request = createMockRequest()

    await auditPublicRegisterGenerate(request, {
      url,
      generatedAt,
      expiresAt
    })

    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: 'public-register',
        subCategory: 'download',
        action: 'generate'
      },
      context: {
        url,
        generatedAt,
        expiresAt
      },
      user: {
        id: userId,
        email: userEmail,
        scope: userScope
      }
    })
  })

  it('records system log with correct structure', async () => {
    const request = createMockRequest()

    await auditPublicRegisterGenerate(request, {
      url,
      generatedAt,
      expiresAt
    })

    expect(mockInsert).toHaveBeenCalledWith({
      createdAt: new Date('2025-12-22T10:00:00.000Z'),
      createdBy: {
        id: userId,
        email: userEmail,
        scope: userScope
      },
      event: {
        category: 'public-register',
        subCategory: 'download',
        action: 'generate'
      },
      context: {
        url,
        generatedAt,
        expiresAt
      }
    })
  })
})
