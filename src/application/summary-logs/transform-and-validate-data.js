import { transformFromSummaryLog } from '#application/waste-records/transform-from-summary-log.js'
import { latestSubmittedSummaryLogRowStates } from '#waste-records/application/read-summary-log-row-states.js'
import { validateDataBusiness } from './validations/data-business.js'
import { ledgerIdFor } from './ledger-id.js'

/** @import {ValidatedSummaryLog, ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {ValidationIssuesCollector} from '#common/validation/validation-issues.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {SummaryLogRowStateRepository} from '#waste-records/repository/port.js' */
/** @import {WasteBalanceLedgerRepository} from '#waste-balances/repository/ledger-port.js' */
/** @import {SubmittedSummaryLog} from './validate-issue-logging.js' */

/**
 * Transforms the upload's validated rows into waste records and runs data
 * business validation against the previous submission. The continuity baseline
 * is the latest submitted summary log's row-state membership.
 *
 * @param {{
 *   summaryLog: SubmittedSummaryLog,
 *   validatedData: ValidatedSummaryLog,
 *   registration: Registration | undefined,
 *   summaryLogRowStateRepository: SummaryLogRowStateRepository,
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
  registration,
  summaryLogRowStateRepository,
  ledgerRepository
}) => {
  const previousSubmission = await latestSubmittedSummaryLogRowStates({
    ...ledgerIdFor(summaryLog, registration),
    ledgerRepository,
    summaryLogRowStateRepository
  })

  /** @type {ValidatedWasteRecord[]} */
  const wasteRecords = transformFromSummaryLog(validatedData, {
    organisationId: summaryLog.organisationId,
    registrationId: summaryLog.registrationId,
    accreditationId: summaryLog.accreditationId
  })

  const issues = validateDataBusiness({ wasteRecords, previousSubmission })

  return { wasteRecords, issues }
}
