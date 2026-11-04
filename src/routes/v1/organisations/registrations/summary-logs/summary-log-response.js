import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { extractResponseMetaFields } from '#domain/summary-logs/extract-response-meta-fields.js'
import { emptyLoadsByReportingPeriod } from '#domain/summary-logs/loads-by-period-status-schema.js'
import { LEDGER_ACCREDITATION_KIND } from '#domain/organisations/model.js'
import { transformValidationResponse } from './transform-validation-response.js'

/** @import { SummaryLog } from '#domain/summary-logs/model.js' */

/** @param {SummaryLog} summaryLog */
const ledgerAccreditationOf = ({ accreditationId, accreditationNumber }) => {
  if (accreditationId === null) {
    return {
      ledgerAccreditation: { kind: LEDGER_ACCREDITATION_KIND.REGISTERED_ONLY }
    }
  }
  if (accreditationId && accreditationNumber) {
    return {
      ledgerAccreditation: {
        kind: LEDGER_ACCREDITATION_KIND.ACCREDITED,
        accreditationNumber
      }
    }
  }
  return {}
}

/**
 * The summary log document as the API answers it, per `summaryLogResponseSchema`.
 *
 * @param {SummaryLog} summaryLog
 */
export const toSummaryLogResponse = (summaryLog) => ({
  status: summaryLog.status,
  ...transformValidationResponse(summaryLog.validation),
  ...(summaryLog.loads && { loads: summaryLog.loads }),
  ...((summaryLog.status === SUMMARY_LOG_STATUS.VALIDATED ||
    summaryLog.status === SUMMARY_LOG_STATUS.SUBMITTED) && {
    loadsByReportingPeriod:
      summaryLog.loadsByReportingPeriod ?? emptyLoadsByReportingPeriod()
  }),
  year: summaryLog.year,
  ...(summaryLog.accreditationId !== undefined && {
    accreditationId: summaryLog.accreditationId
  }),
  ...ledgerAccreditationOf(summaryLog),
  ...extractResponseMetaFields(summaryLog.meta)
})
