import { validateAccreditationId } from './validation.js'
import { STREAM_EVENT_KIND } from './stream-schema.js'
import { performUpdateViaStream } from '../application/update-via-stream.js'
import { appendToStream } from '../application/append-to-stream.js'
import {
  classifyRow,
  ROW_OUTCOME
} from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { findSchemaForProcessingType } from '#domain/summary-logs/table-schemas/index.js'

/** @import {OverseasSitesContext} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */

/**
 * Determines if a record should be included based on schema validation.
 *
 * @param {import('#domain/waste-records/model.js').WasteRecord} record - The waste record
 * @returns {boolean} Whether the record passes validation
 */
const isRecordValid = (record) => {
  const schema = findSchemaForProcessingType(
    record.data?.processingType,
    record.type
  )

  if (!schema) {
    return true
  }

  const { outcome } = classifyRow(record.data, schema)
  return outcome === ROW_OUTCOME.INCLUDED
}

/**
 * Marks each waste record as excluded or included in the waste balance.
 * Excluded records are still passed downstream so that any existing credits
 * can be reversed.
 *
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} wasteRecords
 * @returns {import('#domain/waste-records/model.js').WasteRecord[]}
 */
export const markExcludedRecords = (wasteRecords) => {
  return wasteRecords.map((record) => ({
    ...record,
    excludedFromWasteBalance: !isRecordValid(record)
  }))
}

const dispatchToStream = async ({
  annotatedRecords,
  accreditation,
  validatedAccreditationId,
  dependencies,
  user,
  overseasSites,
  summaryLogId
}) => {
  await performUpdateViaStream({
    wasteRecords: annotatedRecords,
    accreditation: { ...accreditation, id: validatedAccreditationId },
    streamRepository:
      /** @type {import('./stream-port.js').WasteBalanceStreamRepository} */ (
        dependencies.streamRepository
      ),
    dependencies: {
      systemLogsRepository: dependencies.systemLogsRepository
    },
    user: /** @type {import('#domain/summary-logs/worker/port.js').SubmitUser} */ (
      user
    ),
    overseasSites,
    summaryLogId: /** @type {string} */ (summaryLogId)
  })
}

/**
 * Credits a waste balance from summary-log waste records by appending the
 * balance-affecting changes to the event-sourced stream. The stream partition
 * (registrationId, accreditationId) is the sole record of the balance; reads
 * resolve amounts from its latest closing balance.
 *
 * @param {Object} params
 * @param {import('#domain/waste-records/model.js').WasteRecord[] | any[]} params.wasteRecords
 * @param {import('#domain/organisations/accreditation.js').Accreditation} params.accreditation
 * @param {Object} params.dependencies
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [params.dependencies.systemLogsRepository]
 * @param {import('../repository/stream-port.js').WasteBalanceStreamRepository} params.dependencies.streamRepository
 * @param {import('#domain/summary-logs/worker/port.js').SubmitUser} [params.user]
 * @param {OverseasSitesContext} params.overseasSites - Resolved ORS lookup map or ORS_VALIDATION_DISABLED
 * @param {string} [params.summaryLogId]
 */
export const performUpdateWasteBalanceTransactions = async ({
  wasteRecords,
  accreditation,
  dependencies,
  user,
  overseasSites,
  summaryLogId
}) => {
  const annotatedRecords = markExcludedRecords(wasteRecords)

  if (annotatedRecords.length === 0) {
    return
  }

  const validatedAccreditationId = validateAccreditationId(accreditation.id)

  await dispatchToStream({
    annotatedRecords,
    accreditation,
    validatedAccreditationId,
    dependencies,
    user,
    overseasSites,
    summaryLogId
  })
}

/**
 * Append a zero-delta `summary-log-submitted` event into a registered-only
 * (null-accreditation) stream. The submission moves no tonnage, so the
 * stream's closing balance equals its opening balance.
 *
 * @param {Object} params
 * @param {import('./stream-port.js').WasteBalanceStreamRepository} params.streamRepository
 * @param {string} params.registrationId
 * @param {string} params.organisationId
 * @param {string} params.summaryLogId
 * @param {import('./stream-schema.js').StreamUserSummary} params.createdBy
 * @returns {Promise<import('./stream-port.js').StreamEvent>}
 */
export const performAppendRegisteredOnlySubmittedEvent = async ({
  streamRepository,
  registrationId,
  organisationId,
  summaryLogId,
  createdBy
}) =>
  appendToStream(
    {
      repository: streamRepository,
      registrationId,
      accreditationId: null,
      organisationId
    },
    {
      kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
      payload: { summaryLogId, creditTotal: 0 },
      createdBy
    }
  )
