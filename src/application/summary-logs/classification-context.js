import { previousYear } from '#common/helpers/dates/year.js'
import {
  linksYears,
  tableSchemasOf
} from '#domain/summary-logs/table-schemas/index.js'
import { latestSubmittedSummaryLog } from '#waste-balances/application/latest-submitted-summary-log.js'
import {
  classificationContextOf,
  previousYearAccreditationOf,
  validityOf
} from '#waste-balances/application/read-model-accreditations.js'
import { pickLedgerId } from '#waste-balances/repository/ledger-schema.js'

/** @import { ProcessingType } from '#domain/summary-logs/meta-fields.js' */
/** @import { SummaryLogFileId } from '#domain/summary-logs/ids.js' */
/** @import { RowClassificationContext } from '#waste-balances/domain/waste-balance-classification.js' */
/** @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js' */
/** @import { SummaryLogRegistration } from './registration-for-summary-log.js' */
/** @import { SubmittedSummaryLog } from './validate-issue-logging.js' */

/**
 * Everything outside the workbook a summary log's reading depends on
 * (ADR-0058, ADR-0060). The previous year's keys are absent, not null, for a
 * template that does not link years, so its hash is unchanged.
 *
 * @typedef {RowClassificationContext & {
 *   previousYearPosition?: number | null
 * }} SummaryLogContext
 */

/**
 * @typedef {{
 *   number: number,
 *   summaryLogId: SummaryLogFileId,
 *   ledgerId: import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId
 * }} PreviousYearSubmission
 */

/**
 * @typedef {{
 *   ledgerRepository: WasteBalanceLedgerRepository,
 *   summaryLog: Pick<SubmittedSummaryLog, 'organisationNumber' | 'registrationNumber' | 'accreditationNumber' | 'year'>,
 *   registration: SummaryLogRegistration,
 *   processingType: ProcessingType
 * }} SummaryLogContextParams
 */

/**
 * @param {WasteBalanceLedgerRepository} ledgerRepository
 * @param {import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId} ledgerId
 * @returns {Promise<PreviousYearSubmission | null>}
 */
const latestSubmissionIn = async (ledgerRepository, ledgerId) => {
  const latest = await latestSubmittedSummaryLog(ledgerRepository, ledgerId)
  return (
    latest && {
      number: latest.number,
      summaryLogId: latest.summaryLogId,
      ledgerId
    }
  )
}

/**
 * The previous year's keys of the context, read from the summary log's own
 * stream. An accredited log's previous-year stream is that year's
 * accreditation, whose number can differ.
 *
 * @param {Omit<SummaryLogContextParams, 'processingType'>} params
 * @returns {Promise<{ previousYearKeys: Pick<SummaryLogContext, 'previousYearPosition' | 'previousYearAccreditation'>, previousYearSubmission: PreviousYearSubmission | null }>}
 */
const previousYearOf = async ({
  ledgerRepository,
  summaryLog,
  registration
}) => {
  const year = previousYear(summaryLog.year)
  const ledgerId = { ...pickLedgerId(summaryLog), year }

  if (registration.accreditation === null) {
    const registeredOnlySubmission = await latestSubmissionIn(
      ledgerRepository,
      { ...ledgerId, accreditationNumber: null }
    )
    return {
      previousYearKeys: {
        previousYearPosition: registeredOnlySubmission?.number ?? null
      },
      previousYearSubmission: registeredOnlySubmission
    }
  }

  const accreditation = previousYearAccreditationOf(
    registration.registration,
    summaryLog.year
  )
  const previousYearSubmission =
    accreditation &&
    (await latestSubmissionIn(ledgerRepository, {
      ...ledgerId,
      accreditationNumber: accreditation.accreditationNumber
    }))
  return {
    previousYearKeys: {
      previousYearPosition: previousYearSubmission?.number ?? null,
      previousYearAccreditation: accreditation && validityOf(accreditation)
    },
    previousYearSubmission
  }
}

/**
 * The context a summary log is read against, built the same way at validation
 * and at submission so their hashes compare, and the previous-year submission
 * it was read from, so filling in linked rows reads the same one.
 *
 * @param {SummaryLogContextParams} params
 * @returns {Promise<{ context: SummaryLogContext, previousYearSubmission: PreviousYearSubmission | null }>}
 */
export const summaryLogContextOf = async ({ processingType, ...params }) => {
  const tableSchemas = tableSchemasOf(params.summaryLog.year, processingType)
  const context = {
    tableSchemas,
    ...classificationContextOf(params.registration)
  }
  if (!linksYears(tableSchemas)) {
    return { context, previousYearSubmission: null }
  }

  const { previousYearKeys, previousYearSubmission } =
    await previousYearOf(params)
  return {
    context: { ...context, ...previousYearKeys },
    previousYearSubmission
  }
}
