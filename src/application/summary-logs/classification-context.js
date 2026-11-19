import { previousYear } from '#common/helpers/dates/year.js'
import {
  linksYears,
  tableSchemasOf
} from '#domain/summary-logs/table-schemas/index.js'
import { accreditationForYear } from '#organisation-read-model/vocabulary.js'
import { classificationContextOf } from '#waste-balances/application/read-model-accreditations.js'
import {
  LEDGER_EVENT_KIND,
  pickLedgerId
} from '#waste-balances/repository/ledger-schema.js'

/** @import { ProcessingType } from '#domain/summary-logs/meta-fields.js' */
/** @import { SummaryLogFileId } from '#domain/summary-logs/ids.js' */
/** @import { RowClassificationContext } from '#waste-balances/domain/waste-balance-classification.js' */
/** @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js' */
/** @import { SummaryLogSubmittedPayload } from '#waste-balances/repository/ledger-schema.js' */
/** @import { SummaryLogRegistration } from './registration-for-summary-log.js' */
/** @import { SubmittedSummaryLog } from './validate-issue-logging.js' */

/**
 * Everything outside the workbook a summary log's reading depends on
 * (ADR-0058, ADR-0060). `previousYearPosition` is present only for a template
 * that links years, so other templates' contexts hash as they did before it.
 *
 * @typedef {RowClassificationContext & { previousYearPosition?: number | null }} SummaryLogContext
 */

/**
 * @typedef {{
 *   ledgerRepository: WasteBalanceLedgerRepository,
 *   summaryLog: Pick<SubmittedSummaryLog, 'organisationNumber' | 'registrationNumber' | 'accreditationNumber' | 'year'>,
 *   registration: SummaryLogRegistration
 * }} PreviousYearParams
 */

/**
 * The previous year's latest submission in the summary log's own stream, none
 * when the previous year has no such stream or no submission in it. An
 * accredited log reads the previous year's accreditation, which can have a
 * different number.
 *
 * @param {PreviousYearParams} params
 * @returns {Promise<{ number: number, summaryLogId: SummaryLogFileId } | null>}
 */
export const previousYearSubmissionOf = async ({
  ledgerRepository,
  summaryLog,
  registration
}) => {
  const year = previousYear(summaryLog.year)
  const accreditationNumber =
    registration.accreditation === null
      ? null
      : accreditationForYear(registration.registration, year)
          ?.accreditationNumber
  if (accreditationNumber === undefined) {
    return null
  }

  const latest = await ledgerRepository.findLatestInLedgerByKind(
    { ...pickLedgerId(summaryLog), accreditationNumber, year },
    LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED
  )
  if (latest === null) {
    return null
  }

  const { summaryLogId } = /** @type {SummaryLogSubmittedPayload} */ (
    latest.payload
  )
  return { number: latest.number, summaryLogId }
}

/**
 * The context a summary log is read against, built the same way at validation
 * and at submission so their hashes compare.
 *
 * @param {PreviousYearParams & { processingType: ProcessingType }} params
 * @returns {Promise<SummaryLogContext>}
 */
export const summaryLogContextOf = async ({ processingType, ...params }) => {
  const tableSchemas = tableSchemasOf(params.summaryLog.year, processingType)
  const context = {
    tableSchemas,
    ...classificationContextOf(params.registration)
  }
  if (!linksYears(tableSchemas)) {
    return context
  }

  const previousYearSubmission = await previousYearSubmissionOf(params)
  return {
    ...context,
    previousYearPosition: previousYearSubmission?.number ?? null
  }
}
