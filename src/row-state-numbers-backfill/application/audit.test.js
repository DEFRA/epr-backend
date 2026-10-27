import { describe, it, expect, vi } from 'vitest'
import { audit } from '@defra/cdp-auditing'

import {
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { createMockLogger } from '#test/mock-logger.js'
import { auditRowStateNumbersBackfill } from './audit.js'

vi.mock('@defra/cdp-auditing', () => ({ audit: vi.fn() }))

describe('auditRowStateNumbersBackfill', () => {
  it('sends the audit and records a system log for the system user', async () => {
    const systemLogsRepository =
      createSystemLogsRepository()(createMockLogger())
    const context = {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      accreditationId: null,
      rowStates: 3,
      next: {
        organisationNumber: toOrganisationNumber('500123'),
        registrationNumber: toRegistrationNumber('R25SR500010912PL'),
        accreditationNumber: null
      }
    }

    await auditRowStateNumbersBackfill(systemLogsRepository, context)

    const event = {
      category: 'waste-reporting',
      subCategory: 'summary-log-row-states',
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
