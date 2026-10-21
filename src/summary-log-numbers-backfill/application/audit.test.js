import { describe, it, expect, vi } from 'vitest'
import { audit } from '@defra/cdp-auditing'

import { createMockSystemLogsRepository } from '#test/mock-repositories.js'
import { auditSummaryLogNumbersBackfill } from './audit.js'

vi.mock('@defra/cdp-auditing', () => ({ audit: vi.fn() }))

describe('auditSummaryLogNumbersBackfill', () => {
  it('sends the audit and records a system log for the system user', async () => {
    const systemLogsRepository = createMockSystemLogsRepository()
    const context = {
      summaryLogId: 'sl-1',
      previous: { version: 1 },
      next: { organisationNumber: '500123', version: 2 }
    }

    await auditSummaryLogNumbersBackfill(systemLogsRepository, context)

    const event = {
      category: 'waste-reporting',
      subCategory: 'summary-log',
      action: 'numbers-backfill-migration'
    }
    expect(audit).toHaveBeenCalledWith({
      event,
      context,
      user: expect.objectContaining({ id: 'system' })
    })
    expect(systemLogsRepository.insert).toHaveBeenCalledWith({
      createdAt: expect.any(Date),
      createdBy: expect.objectContaining({ id: 'system' }),
      event,
      context
    })
  })
})
