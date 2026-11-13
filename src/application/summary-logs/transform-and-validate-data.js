import { transformFromSummaryLog } from '#application/waste-records/transform-from-summary-log.js'
import { latestSubmittedSummaryLogRowStates } from '#waste-records/application/read-summary-log-row-states.js'
import { validateDataBusiness } from './validations/data-business.js'
import { ledgerIdFor } from './ledger-id.js'

/** @import {ValidatedSummaryLog, ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {ValidationIssuesCollector} from '#common/validation/validation-issues.js' */
/** @import {SummaryLogRowStatesRepository} from '#waste-records/repository/port.js' */
/** @import {WasteBalanceLedgerRepository} from '#waste-balances/repository/ledger-port.js' */
/** @import {SubmittedSummaryLog} from './validate-issue-logging.js' */
/** @import {TableSchema} from '#domain/summary-logs/table-schemas/index.js' */

/**
 * Transforms the upload's validated rows into waste records and runs data
 * business validation against the previous submission. The continuity baseline
 * is the latest submitted summary log's row-state membership.
 *
 * @param {{
 *   summaryLog: SubmittedSummaryLog,
 *   validatedData: ValidatedSummaryLog,
 *   tableSchemas: Record<string, TableSchema>,
 *   summaryLogRowStatesRepository: SummaryLogRowStatesRepository,
 *   ledgerRepository: WasteBalanceLedgerRepository
 * }} params
 * @returns {Promise<{
 *   wasteRecords: ValidatedWasteRecord[],
 *   issues: ValidationIssuesCollector
 * }>}
 */
export const transformAndValidateData = async ({
  summaryLog,
  validatedData,
  tableSchemas,
  summaryLogRowStatesRepository,
  ledgerRepository
}) => {
  const previousSubmission = await latestSubmittedSummaryLogRowStates({
    ...ledgerIdFor(summaryLog),
    ledgerRepository,
    summaryLogRowStatesRepository
  })

  /** @type {ValidatedWasteRecord[]} */
  const wasteRecords = transformFromSummaryLog(validatedData, tableSchemas)

  const issues = validateDataBusiness({
    wasteRecords,
    previousSubmission,
    tableSchemas
  })

  return { wasteRecords, issues }
}
