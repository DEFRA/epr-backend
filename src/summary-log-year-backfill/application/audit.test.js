import { describe, it, expect, vi } from 'vitest'
import { audit } from '@defra/cdp-auditing'

import { createMockSystemLogsRepository } from '#test/mock-repositories.js'
import { auditSummaryLogYearBackfill } from './audit.js'

vi.mock('@defra/cdp-auditing', () => ({ audit: vi.fn() }))

describe('auditSummaryLogYearBackfill', () => {
  it('sends the audit and records a system log for the system user', async () => {
    const systemLogsRepository = createMockSystemLogsRepository()
    const context = {
      summaryLogId: 'sl-1',
      previous: { year: undefined, version: 1 },
      next: { year: 2026, version: 2 }
    }

    await auditSummaryLogYearBackfill(systemLogsRepository, context)

    const event = {
      category: 'waste-reporting',
      subCategory: 'summary-log',
      action: 'year-backfill-migration'
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
