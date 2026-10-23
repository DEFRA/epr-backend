import { describe, it, expect, vi } from 'vitest'
import { audit } from '@defra/cdp-auditing'

import {
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { createMockLogger } from '#test/mock-logger.js'
import { auditReportNumbersBackfill } from './audit.js'

vi.mock('@defra/cdp-auditing', () => ({ audit: vi.fn() }))

describe('auditReportNumbersBackfill', () => {
  it('sends the audit and records a system log for the system user', async () => {
    const systemLogsRepository =
      createSystemLogsRepository()(createMockLogger())
    const context = {
      reportId: 'rep-1',
      organisationId: 'org-1',
      registrationId: 'reg-1',
      next: {
        organisationNumber: toOrganisationNumber('500123'),
        registrationNumber: toRegistrationNumber('R25SR500010912PL')
      }
    }

    await auditReportNumbersBackfill(systemLogsRepository, context)

    const event = {
      category: 'waste-reporting',
      subCategory: 'reports',
      action: 'numbers-backfill-migration'
    }
    expect(audit).toHaveBeenCalledWith({
      event,
      context,
      user: expect.objectContaining({ id: 'system' })
    })
    expect((await systemLogsRepository.find({ limit: 10 })).systemLogs).toEqual(
      [
        expect.objectContaining({
          createdBy: expect.objectContaining({ id: 'system' }),
          event,
          context
        })
      ]
    )
  })
})
