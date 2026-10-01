import { onTestFinished, vi } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { emptyLoadsByReportingPeriod } from '#domain/summary-logs/loads-by-period-status-schema.js'
import { MONTHLY_PERIODS } from '#reports/domain/period-labels.js'
import { partialMock } from '#test/type-helpers.js'

import { withPeriodsRequiringResubmission } from './periods-requiring-resubmission.js'

const JANUARY_2025 = {
  year: 2025,
  cadence: /** @type {const} */ ('monthly'),
  period: MONTHLY_PERIODS.January
}

// The integration tests cannot fail the gate before its per-period comparisons
// without also failing validation, which shares the same repository reads.
describe('withPeriodsRequiringResubmission', () => {
  it('falls back to every closed period when the gate fails before comparing', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
    onTestFinished(() => errorSpy.mockRestore())
    const loadsByReportingPeriod = {
      ...emptyLoadsByReportingPeriod(),
      closedPeriods: [JANUARY_2025]
    }

    const result = await withPeriodsRequiringResubmission(
      partialMock({
        loadsByReportingPeriod,
        wasteRecords: [],
        summaryLog: partialMock({
          organisationId: 'org-1',
          registrationId: 'reg-1'
        }),
        summaryLogId: 'sl-1',
        registration: partialMock({ wasteProcessingType: 'unrecognised' }),
        periodicReports: []
      })
    )

    expect(result?.periodsRequiringResubmission).toEqual([JANUARY_2025])
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Failed to compute periods requiring resubmission for summary log sl-1'
      })
    )
  })
})
