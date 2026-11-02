import { SCOPES } from '#common/helpers/auth/constants.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { auditSummaryLogDownload } from '#root/auditing/summary-logs.js'

/** @import { HapiRequest, HapiResponseToolkit, HapiResponseObject } from '#common/hapi-types.js' */
/** @import { RegistrationNumber } from '#domain/organisations/numbers.js' */
/** @import { RegistrationParams } from '#routes/organisations/natural-keys.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */

const downloadAuth = {
  auth: {
    scope: [`+${SCOPES.summaryLogRead}`, `+${SCOPES.organisationRead}`]
  },
  tags: ['api']
}

/**
 * @param {(repository: SummaryLogsRepository, id: string, registrationNumber: RegistrationNumber) => Promise<{ url: string }>} sign
 * @param {(params: Record<string, string>) => string} idOf
 * @returns {(request: HapiRequest & {
 *   params: Record<string, string> & RegistrationParams,
 *   summaryLogsRepository: SummaryLogsRepository
 * }, h: HapiResponseToolkit) => Promise<HapiResponseObject>}
 */
const serveFile = (sign, idOf) => async (request, h) => {
  const { summaryLogsRepository, logger } = request
  const { organisationId, registrationId, registrationNumber } = request.params
  const id = idOf(request.params)

  const { url } = await sign(summaryLogsRepository, id, registrationNumber)

  await auditSummaryLogDownload(request, {
    summaryLogId: id,
    organisationId,
    registrationId
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
    (repository, id, registrationNumber) =>
      repository.getDownloadUrl(id, registrationNumber),
    (params) => params.summaryLogId
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
    (repository, id, registrationNumber) =>
      repository.getDownloadUrlByFileId(id, registrationNumber),
    (params) => params.fileId
  )
}
