import { summaryLogRowStatesForRegistration } from '#waste-records/application/read-summary-log-row-states.js'
import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'

import { reconcileRegistration } from './reconcile-registration.js'

/**
 * Read the summary-log row state and legacy waste-record views for one
 * registration ledger and reconcile them. Read-only: resolves the committed
 * head from the ledger, the summary-log row states at that head, and the legacy
 * waste-records for the registration, then compares. The ledger and summary-log
 * row state reads reuse the production `summaryLogRowStatesForRegistration`
 * read model.
 *
 * @param {Object} input
 * @param {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} input.ledgerRepository
 * @param {import('#waste-records/repository/port.js').SummaryLogRowStateRepository} input.summaryLogRowStateRepository
 * @param {Pick<import('#repositories/waste-records/port.js').WasteRecordsRepository, 'findByRegistration'>} input.wasteRecordsRepository
 * @param {string} input.organisationId
 * @param {string} input.registrationId
 * @param {string | null} input.accreditationId
 * @param {import('#domain/organisations/accreditation.js').Accreditation | null} input.accreditation
 * @param {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} input.overseasSites
 */
export const reconcileLedger = async ({
  ledgerRepository,
  summaryLogRowStateRepository,
  wasteRecordsRepository,
  organisationId,
  registrationId,
  accreditationId,
  accreditation,
  overseasSites
}) => {
  const latestEvent = await ledgerRepository.findLatestInLedgerByKind(
    registrationId,
    accreditationId,
    LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED
  )
  const payload =
    /** @type {import('#waste-balances/repository/ledger-schema.js').SummaryLogSubmittedPayload | undefined} */ (
      latestEvent?.payload
    )
  const head = payload?.summaryLogId ?? null
  const eventCreditTotal = payload?.creditTotal ?? null

  const wasteRecordStates = await summaryLogRowStatesForRegistration({
    ledgerRepository,
    summaryLogRowStateRepository,
    organisationId,
    registrationId,
    accreditationId
  })
  const wasteRecords = await wasteRecordsRepository.findByRegistration(
    organisationId,
    registrationId
  )

  return reconcileRegistration({
    registrationId,
    accreditationId,
    head,
    eventCreditTotal,
    wasteRecordStates,
    wasteRecords,
    accreditation,
    overseasSites
  })
}
