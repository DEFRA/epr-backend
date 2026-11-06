import { loadsByReportingPeriodSchema } from './loads-by-period-status-schema.js'

describe('loadsByReportingPeriodSchema', () => {
  it('documents closedPeriods as deprecated in favour of periodsRequiringResubmission', () => {
    expect(
      loadsByReportingPeriodSchema.extract('closedPeriods').describe()
    ).toMatchObject({
      flags: {
        description: expect.stringMatching(
          /^Deprecated: use periodsRequiringResubmission\./
        )
      },
      metas: [{ deprecated: true }]
    })
  })
})
