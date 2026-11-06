import { logger } from '#common/helpers/logging/logger.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { auditReverseAccreditationCancellation } from './reverse-accreditation-cancellation.js'

const mockAudit = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))
vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { warn: vi.fn() }
}))
vi.mock('#root/config.js', () => ({
  config: {
    get: vi.fn((name) =>
      name === 'audit.maxPayloadSizeBytes' ? 10000 : undefined
    )
  }
}))

describe('auditReverseAccreditationCancellation', () => {
  const now = new Date('2026-11-06T12:00:00.000Z')
  const systemUser = { id: 'system', email: 'system', scope: [], role: null }
  const event = {
    category: 'entity',
    subCategory: 'epr-organisations',
    action: 'reverse-accreditation-cancellation'
  }
  const identifiers = {
    organisationId: 'org-1',
    accreditationId: 'acc-1',
    reason: 'Court order'
  }

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

  const storedSystemLogs = async () => {
    const { systemLogs } = await systemLogsRepository.find({ limit: 10 })
    return systemLogs
  }

  it('sends the full before and after state to the CDP audit and the system log', async () => {
    const context = {
      ...identifiers,
      previous: { status: 'cancelled' },
      next: { status: 'approved' }
    }

    await auditReverseAccreditationCancellation(systemLogsRepository, context)

    expect(mockAudit).toHaveBeenCalledWith({ event, context, user: systemUser })
    expect(await storedSystemLogs()).toEqual([
      expect.objectContaining({
        createdAt: now,
        createdBy: systemUser,
        event,
        context
      })
    ])
  })

  it('sends only the identifiers and reason to the CDP audit when the state is too large, keeping it all in the system log', async () => {
    const context = {
      ...identifiers,
      previous: { padding: 'x'.repeat(10000) },
      next: { status: 'approved' }
    }

    await auditReverseAccreditationCancellation(systemLogsRepository, context)

    expect(mockAudit).toHaveBeenCalledWith({
      event,
      context: identifiers,
      user: systemUser
    })
    const [systemLog] = await storedSystemLogs()
    expect(systemLog.context).toEqual(context)
  })
})
