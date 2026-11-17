/** @import {SummaryLogFileId, SummaryLogId} from '#domain/summary-logs/ids.js' */
import Boom from '@hapi/boom'

/**
 * @import { SummaryLogKeyedRequest } from './at-summary-log-keys.js'
 * @import { SummaryLogsRepository, SummaryLogVersion } from '#repositories/summary-logs/port.js'
 * @import { RegistrationParams } from '#shared/organisations/natural-keys.js'
 */

/**
 * @param {SummaryLogVersion | null} stored
 * @param {RegistrationParams} params
 */
const assertStoredUnderPath = (
  stored,
  { organisationNumber, registrationNumber }
) => {
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

/**
 * A summary log is read only under the organisation and registration numbers
 * it is stored with. One not stored yet passes: its upload is still in progress.
 *
 * @param {SummaryLogKeyedRequest & {
 *   params: { summaryLogId: SummaryLogId },
 *   summaryLogsRepository: SummaryLogsRepository
 * }} request
 */
export const assertSummaryLogMatchesPath = async (request) =>
  assertStoredUnderPath(
    await request.summaryLogsRepository.findById(request.params.summaryLogId),
    request.params
  )

/**
 * The same rule for a file addressed by its id. A file no summary log holds
 * passes, and its download is not found.
 *
 * @param {SummaryLogKeyedRequest & {
 *   params: { fileId: SummaryLogFileId },
 *   summaryLogsRepository: SummaryLogsRepository
 * }} request
 */
export const assertSummaryLogFileMatchesPath = async (request) =>
  assertStoredUnderPath(
    await request.summaryLogsRepository.findByFileId(request.params.fileId),
    request.params
  )
