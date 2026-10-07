import Boom from '@hapi/boom'

/**
 * @import { ResolvedRequest } from '#routes/organisations/at-natural-keys.js'
 * @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js'
 */

/**
 * A summary log is read only under the organisation and registration it
 * belongs to. One not stored yet passes: its upload is still in progress.
 *
 * @param {ResolvedRequest & {
 *   params: { summaryLogId: string },
 *   summaryLogsRepository: SummaryLogsRepository
 * }} request
 */
export const assertSummaryLogMatchesPath = async (request) => {
  const { organisationId, registrationId, summaryLogId } = request.params
  const stored = await request.summaryLogsRepository.findById(summaryLogId)
  if (!stored) {
    return
  }

  const { summaryLog } = stored
  if (
    summaryLog.organisationId !== organisationId ||
    summaryLog.registrationId !== registrationId
  ) {
    throw Boom.notFound('Summary log not found')
  }
}
