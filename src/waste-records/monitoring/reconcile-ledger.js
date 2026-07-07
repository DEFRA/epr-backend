import { summaryLogRowStatesForRegistration } from '#waste-records/application/read-summary-log-row-states.js'
import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'

import { reconcileRegistration } from './reconcile-registration.js'

/**
 * Read the summary-log row state and legacy waste-record views for one
 * registration ledger and reconcile them. Read-only: resolves the committed
 * head and the committed summary-log id set (the stream) from the ledger, the
 * summary-log row states at that head, and the legacy waste-records for the
 * registration, then compares. The committed id set anchors the carry-forward
 * baseline in `reconcileRegistration`. The ledger and summary-log row state
 * reads reuse the production `summaryLogRowStatesForRegistration` read model.
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
  const events = await ledgerRepository.findAllInLedger(
    registrationId,
    accreditationId
  )
  const submittedPayloads =
    /** @type {import('#waste-balances/repository/ledger-schema.js').SummaryLogSubmittedPayload[]} */ (
      events
        .filter(
          (event) => event.kind === LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED
        )
        .map((event) => event.payload)
    )
  const committedSummaryLogIds = new Set(
    submittedPayloads.map((payload) => payload.summaryLogId)
  )
  const latestPayload = submittedPayloads.at(-1)
  const head = latestPayload?.summaryLogId ?? null
  const eventCreditTotal = latestPayload?.creditTotal ?? null

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
    committedSummaryLogIds,
    eventCreditTotal,
    wasteRecordStates,
    wasteRecords,
    accreditation,
    overseasSites
  })
}
