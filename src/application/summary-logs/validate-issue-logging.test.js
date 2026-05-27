import { createValidationIssues } from '#common/validation/validation-issues.js'
import { VALIDATION_CATEGORY, VALIDATION_CODE } from '#common/enums/index.js'

import { logValidationIssues } from './validate-issue-logging.js'

/** @import {TypedLogger} from '#common/helpers/logging/logger.js' */
/** @import {SubmittedSummaryLog} from './validate-issue-logging.js' */

describe('logValidationIssues', () => {
  /** @type {TypedLogger} */
  let logger

  beforeEach(() => {
    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: () => logger
    }
  })

  const summaryLog = /** @type {SubmittedSummaryLog} */ ({
    organisationId: 'org-123',
    registrationId: 'reg-456',
    file: {
      id: 'file-1',
      name: 'test.xlsx',
      status: 'complete',
      uri: 's3://x'
    },
    status: 'validating'
  })

  describe('issue-log cap', () => {
    it('should cap per-issue logs at MAX_VALIDATION_ISSUES and report total + logged in the summary', () => {
      const issues = createValidationIssues()
      Array.from({ length: 150 }).forEach(() =>
        issues.addError(
          VALIDATION_CATEGORY.TECHNICAL,
          'issue',
          VALIDATION_CODE.FIELD_REQUIRED
        )
      )

      logValidationIssues({
        summaryLogId: 'summary-1',
        summaryLog,
        issues,
        logger
      })

      const warnCalls = /** @type {{ mock: { calls: any[][] } }} */ (
        /** @type {unknown} */ (logger.warn)
      ).mock.calls

      const issueLogs = warnCalls.filter(
        ([payload]) => payload?.event?.action === 'summary_log_validation_issue'
      )
      const [summaryPayload] = warnCalls
        .filter(
          ([payload]) =>
            payload?.event?.action === 'summary_log_validation_completed'
        )
        .map(([payload]) => payload)

      expect(issueLogs).toHaveLength(100)
      expect(summaryPayload.message).toContain('total=150')
      expect(summaryPayload.message).toContain('logged=100')
    })

    it('should report total === logged when issues fit under the cap', () => {
      const issues = createValidationIssues()
      issues.addError(
        VALIDATION_CATEGORY.TECHNICAL,
        'lonely issue',
        VALIDATION_CODE.FIELD_REQUIRED
      )

      logValidationIssues({
        summaryLogId: 'summary-1',
        summaryLog,
        issues,
        logger
      })

      const warnCalls = /** @type {{ mock: { calls: any[][] } }} */ (
        /** @type {unknown} */ (logger.warn)
      ).mock.calls
      const [summaryPayload] = warnCalls
        .filter(
          ([payload]) =>
            payload?.event?.action === 'summary_log_validation_completed'
        )
        .map(([payload]) => payload)

      expect(summaryPayload.message).toContain('total=1')
      expect(summaryPayload.message).toContain('logged=1')
    })
  })
})
