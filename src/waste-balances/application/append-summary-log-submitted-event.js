import { STREAM_EVENT_KIND } from '../repository/stream-schema.js'
import { appendToStream } from './append-to-stream.js'

/**
 * Append a `summary-log-submitted` event recording that a summary log was
 * submitted.
 *
 * The `creditTotal` is the submission's contribution to the stream's waste
 * balance: the aggregate target amount for an accredited submission, or zero
 * for a registered-only (null-accreditation) submission, which has no balance
 * and so leaves the stream's closing balance equal to its opening balance.
 *
 * @param {Object} params
 * @param {import('../repository/stream-port.js').WasteBalanceStreamRepository} params.repository
 * @param {string} params.registrationId
 * @param {string | null} params.accreditationId
 * @param {string} params.organisationId
 * @param {string} params.summaryLogId
 * @param {number} params.creditTotal
 * @param {import('../repository/stream-schema.js').StreamUserSummary} params.createdBy
 * @returns {Promise<import('../repository/stream-port.js').StreamEvent>}
 */
export const appendSummaryLogSubmittedEvent = async ({
  repository,
  registrationId,
  accreditationId,
  organisationId,
  summaryLogId,
  creditTotal,
  createdBy
}) =>
  appendToStream(
    {
      repository,
      registrationId,
      accreditationId,
      organisationId
    },
    {
      kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
      payload: { summaryLogId, creditTotal },
      createdBy
    }
  )
