import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { emptyLoadsByReportingPeriod } from '#domain/summary-logs/loads-by-period-status-schema.js'

import { summaryLogResponseSchema } from './response.schema.js'
import { expectValidationError } from '#common/validation/validation-test-helpers.js'

describe('summaryLogResponseSchema', () => {
  describe('processing-type', () => {
    // A validated response always pairs with loadsByReportingPeriod (required by
    // the sibling rule), so include it to isolate the processingType assertion.
    const validatedBase = {
      status: SUMMARY_LOG_STATUS.VALIDATED,
      loadsByReportingPeriod: emptyLoadsByReportingPeriod()
    }

    it('should require processing-type when status is validated', () => {
      const details = expectValidationError(
        summaryLogResponseSchema,
        validatedBase
      )

      expect(details).toStrictEqual([
        expect.objectContaining({
          type: 'any.required',
          path: ['processingType']
        })
      ])
    })

    it('should accept a validated response that includes processing-type', () => {
      const { error } = summaryLogResponseSchema.validate({
        ...validatedBase,
        processingType: 'EXPORTER'
      })

      expect(error).toBeUndefined()
    })

    it('should not require processing-type before validation', () => {
      const { error } = summaryLogResponseSchema.validate({
        status: SUMMARY_LOG_STATUS.PREPROCESSING
      })

      expect(error).toBeUndefined()
    })
  })
})
