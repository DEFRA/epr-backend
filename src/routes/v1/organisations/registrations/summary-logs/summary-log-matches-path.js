/** @import {SummaryLogId} from '#domain/summary-logs/ids.js' */
import Boom from '@hapi/boom'

/**
 * @import { SummaryLogKeyedRequest } from './at-summary-log-keys.js'
 * @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js'
 */

/**
 * A summary log is read only under the organisation and registration numbers
 * it is stored with. One not stored yet passes: its upload is still in progress.
 *
 * @param {SummaryLogKeyedRequest & {
 *   params: { summaryLogId: SummaryLogId },
 *   summaryLogsRepository: SummaryLogsRepository
 * }} request
 */
export const assertSummaryLogMatchesPath = async (request) => {
  const { organisationNumber, registrationNumber, summaryLogId } =
    request.params
  const stored = await request.summaryLogsRepository.findById(summaryLogId)
  if (!stored) {
    return
  }

  const { summaryLog } = stored
  if (
    summaryLog.organisationNumber !== organisationNumber ||
    summaryLog.registrationNumber !== registrationNumber
  ) {
    throw Boom.notFound('Summary log not found')
  }
}
