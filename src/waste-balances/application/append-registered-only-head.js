import { STREAM_EVENT_KIND } from '../repository/stream-schema.js'
import { appendToStream } from './append-to-stream.js'

/**
 * Append a zero-delta `summary-log-submitted` committed-head event into a
 * registered-only (null-accreditation) stream partition.
 *
 * Registered-only submissions have no waste balance to contribute to — the
 * balance is per-accreditation — so the head carries `creditTotal: 0` and the
 * stream's closing balance equals its opening balance. The head exists purely
 * so the uniform head-anchored read model can resolve the submission's row-state
 * membership for the null partition, which otherwise has no head.
 *
 * @param {Object} params
 * @param {import('../repository/stream-port.js').WasteBalanceStreamRepository} params.repository
 * @param {string} params.registrationId
 * @param {string} params.organisationId
 * @param {string} params.summaryLogId
 * @param {import('../repository/stream-schema.js').StreamUserSummary} params.createdBy
 * @returns {Promise<import('../repository/stream-port.js').StreamEvent>}
 */
export const appendRegisteredOnlyHead = async ({
  repository,
  registrationId,
  organisationId,
  summaryLogId,
  createdBy
}) =>
  appendToStream(
    {
      repository,
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
