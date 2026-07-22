import { transformFromSummaryLog } from '#application/waste-records/transform-from-summary-log.js'
import { latestSubmittedSummaryLogRowStates } from '#waste-records/application/read-summary-log-row-states.js'
import { validateDataBusiness } from './validations/data-business.js'
import { ledgerIdFor } from './ledger-id.js'

/** @import {ValidatedSummaryLog, ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {ValidationIssuesCollector} from '#common/validation/validation-issues.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {WasteRecordsRepository} from '#repositories/waste-records/port.js' */
/** @import {SummaryLogRowStateRepository} from '#waste-records/repository/port.js' */
/** @import {WasteBalanceLedgerRepository} from '#waste-balances/repository/ledger-port.js' */
/** @import {SubmittedSummaryLog} from './validate-issue-logging.js' */

/**
 * Transforms the upload's validated rows into waste records and runs data
 * business validation against the previous submission. Both prior-state reads
 * live here: the latest submitted summary log's row-state membership (the
 * continuity baseline) and the registration's existing waste records (the
 * transform's change/version reconciliation).
 *
 * @param {{
 *   summaryLogId: string,
 *   summaryLog: SubmittedSummaryLog,
 *   validatedData: ValidatedSummaryLog,
 *   registration: Registration | undefined,
 *   wasteRecordsRepository: WasteRecordsRepository,
 *   summaryLogRowStateRepository: SummaryLogRowStateRepository,
 *   ledgerRepository: WasteBalanceLedgerRepository
 * }} params
 * @returns {Promise<{
 *   wasteRecords: ValidatedWasteRecord[],
 *   issues: ValidationIssuesCollector
 * }>}
 */
export const transformAndValidateData = async ({
  summaryLogId,
  summaryLog,
  validatedData,
  registration,
  wasteRecordsRepository,
  summaryLogRowStateRepository,
  ledgerRepository
}) => {
  const previousSubmission = await latestSubmittedSummaryLogRowStates({
    ...ledgerIdFor(summaryLog, registration),
    ledgerRepository,
    summaryLogRowStateRepository
  })

  const existingWasteRecords = await wasteRecordsRepository.findByRegistration(
    summaryLog.organisationId,
    summaryLog.registrationId
  )

  const existingRecordsMap = new Map(
    existingWasteRecords.map((record) => [
      `${record.type}:${record.rowId}`,
      record
    ])
  )

  // Timestamp is required but won't be persisted during validation
  /** @type {ValidatedWasteRecord[]} */
  const wasteRecords = transformFromSummaryLog(
    validatedData,
    {
      summaryLog: {
        id: summaryLogId,
        uri: summaryLog.file.uri
      },
      organisationId: summaryLog.organisationId,
      registrationId: summaryLog.registrationId,
      accreditationId: summaryLog.accreditationId,
      timestamp: new Date().toISOString()
    },
    existingRecordsMap
  )

  const issues = validateDataBusiness({ wasteRecords, previousSubmission })

  return { wasteRecords, issues }
}
