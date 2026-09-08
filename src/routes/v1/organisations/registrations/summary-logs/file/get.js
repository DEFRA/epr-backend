import { SCOPES } from '#common/helpers/auth/constants.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { auditSummaryLogDownload } from '#root/auditing/summary-logs.js'

/** @import { HapiRequest } from '#common/hapi-types.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */

export const summaryLogFilePath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{summaryLogId}/file'

export const summaryLogFileByFileIdPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/files/{fileId}'

const downloadAuth = {
  auth: {
    scope: [`+${SCOPES.summaryLogRead}`, `+${SCOPES.organisationRead}`]
  },
  tags: ['api']
}

/**
 * @param {(repository: SummaryLogsRepository, id: string, registrationNumber?: string) => Promise<{ url: string }>} sign
 * @param {(params: Record<string, string>) => string} idOf
 * @returns {(request: HapiRequest & {
 *   params: Record<string, string>,
 *   summaryLogsRepository: SummaryLogsRepository,
 *   systemLogsRepository: SystemLogsRepository
 * }, h: Object) => Promise<Object>}
 */
const serveFile = (sign, idOf) => async (request, h) => {
  const { summaryLogsRepository, organisationsRepository, logger } = request
  const { organisationId, registrationId } = request.params
  const id = idOf(request.params)

  // Names the download only, so a failed lookup costs the name, not the file.
  const registrationNumber = await organisationsRepository
    .findRegistrationById(organisationId, registrationId)
    .then((registration) => registration.registrationNumber)
    .catch(() => undefined)

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
  path: summaryLogFilePath,
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
  path: summaryLogFileByFileIdPath,
  options: downloadAuth,
  handler: serveFile(
    (repository, id, registrationNumber) =>
      repository.getDownloadUrlByFileId(id, registrationNumber),
    (params) => params.fileId
  )
}
