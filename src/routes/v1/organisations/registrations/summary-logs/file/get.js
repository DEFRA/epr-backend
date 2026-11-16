import { SCOPES } from '#common/helpers/auth/constants.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { auditSummaryLogDownload } from '#root/auditing/summary-logs.js'
import { toSummaryLogFileId, toSummaryLogId } from '#domain/summary-logs/ids.js'

/** @import { HapiRequest, HapiResponseToolkit, HapiResponseObject } from '#common/hapi-types.js' */
/** @import { RegistrationNumber } from '#domain/organisations/numbers.js' */
/** @import { RegistrationParams } from '#routes/organisations/natural-keys.js' */
/** @import { DownloadUrlResult, SummaryLogsRepository } from '#repositories/summary-logs/port.js' */

const downloadAuth = {
  auth: {
    scope: [`+${SCOPES.summaryLogRead}`, `+${SCOPES.organisationRead}`]
  },
  tags: ['api']
}

/**
 * @template {string} Id
 * @param {(params: Record<string, string>) => Id} idOf
 * @param {(repository: SummaryLogsRepository, id: Id, registrationNumber: RegistrationNumber) => Promise<DownloadUrlResult>} sign
 * @returns {(request: HapiRequest & {
 *   params: Record<string, string> & RegistrationParams,
 *   summaryLogsRepository: SummaryLogsRepository
 * }, h: HapiResponseToolkit) => Promise<HapiResponseObject>}
 */
const serveFile = (idOf, sign) => async (request, h) => {
  const { summaryLogsRepository, logger } = request
  const {
    organisationId,
    registrationId,
    organisationNumber,
    registrationNumber
  } = request.params
  const id = idOf(request.params)

  const { url, accreditationNumber } = await sign(
    summaryLogsRepository,
    id,
    registrationNumber
  )

  await auditSummaryLogDownload(request, {
    summaryLogId: id,
    organisationNumber,
    registrationNumber,
    accreditationNumber
  })

  logger.info({
    message: `Summary log file downloaded for summaryLogId: ${id}, organisationId: ${organisationId}, registrationId: ${registrationId}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
      reference: id
    }
  })

  return h.redirect(url).temporary()
}

export const summaryLogFile = {
  method: 'GET',
  options: downloadAuth,
  handler: serveFile(
    (params) => toSummaryLogId(params.summaryLogId),
    (repository, id, registrationNumber) =>
      repository.getDownloadUrl(id, registrationNumber)
  )
}

/**
 * The waste balance ledger records a submission by its file, not by the log
 * holding it, so a download reached from the ledger is addressed that way.
 */
export const summaryLogFileByFileId = {
  method: 'GET',
  options: downloadAuth,
  handler: serveFile(
    (params) => toSummaryLogFileId(params.fileId),
    (repository, id, registrationNumber) =>
      repository.getDownloadUrlByFileId(id, registrationNumber)
  )
}
