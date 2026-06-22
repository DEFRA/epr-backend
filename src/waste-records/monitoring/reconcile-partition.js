import { wasteRecordStatesForRegistration } from '#waste-records/application/read-waste-record-states.js'
import { STREAM_EVENT_KIND } from '#waste-balances/repository/stream-schema.js'

import { reconcileRegistration } from './reconcile-registration.js'

/**
 * Read the committed row-state and legacy waste-record views for one
 * registration partition and reconcile them. Read-only: resolves the committed
 * head from the stream, the row-states at that head, and the legacy
 * waste-records for the registration, then compares. The stream and row-state
 * reads reuse the production `wasteRecordStatesForRegistration` read model.
 *
 * @param {Object} input
 * @param {import('#waste-balances/repository/stream-port.js').WasteBalanceStreamRepository} input.streamRepository
 * @param {import('#waste-records/repository/port.js').RowStateRepository} input.rowStateRepository
 * @param {Pick<import('#repositories/waste-records/port.js').WasteRecordsRepository, 'findByRegistration'>} input.wasteRecordsRepository
 * @param {string} input.organisationId
 * @param {string} input.registrationId
 * @param {string | null} input.accreditationId
 * @param {import('#domain/organisations/accreditation.js').Accreditation | null} input.accreditation
 * @param {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} input.overseasSites
 */
export const reconcilePartition = async ({
  streamRepository,
  rowStateRepository,
  wasteRecordsRepository,
  organisationId,
  registrationId,
  accreditationId,
  accreditation,
  overseasSites
}) => {
  const latestEvent = await streamRepository.findLatestByPartitionAndKind(
    registrationId,
    accreditationId,
    STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED
  )
  const payload =
    /** @type {import('#waste-balances/repository/stream-schema.js').SummaryLogSubmittedPayload | undefined} */ (
      latestEvent?.payload
    )
  const head = payload?.summaryLogId ?? null
  const eventCreditTotal = payload?.creditTotal ?? null

  const rowStates = await wasteRecordStatesForRegistration({
    streamRepository,
    rowStateRepository,
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
    rowStates,
    wasteRecords,
    accreditation,
    overseasSites
  })
}
