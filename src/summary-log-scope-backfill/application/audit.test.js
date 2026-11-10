import { describe, it, expect, vi } from 'vitest'
import { audit } from '@defra/cdp-auditing'

import { toYear } from '#common/helpers/dates/year.js'
import { createMockSystemLogsRepository } from '#test/mock-repositories.js'
import { auditSummaryLogScopeBackfill } from './audit.js'

vi.mock('@defra/cdp-auditing', () => ({ audit: vi.fn() }))

describe('auditSummaryLogScopeBackfill', () => {
  it('sends the audit and records a system log for the system user', async () => {
    const systemLogsRepository = createMockSystemLogsRepository()
    const context = {
      summaryLogId: 'sl-1',
      previous: { version: 1 },
      next: { year: toYear(2026), version: 2 }
    }

    await auditSummaryLogScopeBackfill(systemLogsRepository, context)

    const event = {
      category: 'waste-reporting',
      subCategory: 'summary-log',
      action: 'scope-backfill-migration'
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
