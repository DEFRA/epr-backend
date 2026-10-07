import Boom from '@hapi/boom'

/**
 * @import { ResolvedRequest } from '#routes/organisations/at-natural-keys.js'
 * @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js'
 */

/**
 * A summary log is read back only from the address it was posted to. One not
 * stored yet passes: its upload is still in progress.
 *
 * @param {ResolvedRequest & {
 *   params: { summaryLogId: string },
 *   summaryLogsRepository: SummaryLogsRepository
 * }} request
 */
export const assertSummaryLogMatchesPath = async (request) => {
  const { organisationId, registrationId, year, summaryLogId } = request.params
  const stored = await request.summaryLogsRepository.findById(summaryLogId)
  if (!stored) {
    return
  }

  const { summaryLog } = stored
  if (
    summaryLog.organisationId !== organisationId ||
    summaryLog.registrationId !== registrationId ||
    summaryLog.year !== year
  ) {
    throw Boom.notFound('Summary log not found')
  }
}
