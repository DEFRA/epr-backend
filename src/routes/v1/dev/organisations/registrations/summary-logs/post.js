import { randomUUID } from 'node:crypto'
import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { supersedeIfStale } from '#application/summary-logs/supersede-if-stale.js'
import { extractUser } from '#adapters/sqs-command-executor/sqs-command-executor.js'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import {
  calculateExpiresAt,
  NO_PRIOR_SUBMISSION,
  SUMMARY_LOG_STATUS
} from '#domain/summary-logs/status.js'
import { SUMMARY_LOG_META_FIELDS } from '#domain/summary-logs/meta-fields.js'
import { templateForRegistration } from '#domain/summary-logs/template-for-registration.js'
import { isRegistrationAccredited } from '#domain/organisations/registration-utils.js'
import { toSummaryLogResponse } from '#routes/v1/organisations/registrations/summary-logs/summary-log-response.js'
import { auditSummaryLogSubmit } from '#root/auditing/summary-logs.js'
import { buildSummaryLogHandlerDeps } from '#server/queue-consumer/summary-log-handler-deps.js'
import {
  submitSummaryLogCommand,
  validateSummaryLogCommand
} from '#server/queue-consumer/summary-log-commands.js'
import { waitForVersion } from '#common/helpers/polling/wait-for-version.js'
import {
  summaryLogContentParamsSchema,
  summaryLogContentPayloadSchema
} from './post.schema.js'

/** @import { HapiRequest } from '#common/hapi-types.js' */
/** @import { ParsedSummaryLog } from '#domain/summary-logs/extractor/port.js' */
/** @import { SummaryLogVersion } from '#repositories/summary-logs/port.js' */
/** @import { CommandHandler, SubmitCommandPayload, SummaryLogHandlerDeps, ValidateCommandPayload } from '#server/queue-consumer/summary-log-commands.js' */
/** @import { SummaryLogHandlerSources } from '#server/queue-consumer/summary-log-handler-deps.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */
/** @import { SummaryLogContentPayload } from './post.schema.js' */

const MAX_PAYLOAD_BYTES = 100 * 1024 * 1024

const COVER_SHEET = 'Cover'
const FIRST_DATA_ROW = 2

// Reads can come from a replica, so each read after a write waits for the
// version that write leaves behind: the insert makes 1, validation makes 2.
const INSERTED_VERSION = 1
const VALIDATED_VERSION = INSERTED_VERSION + 1

/**
 * A workbook's metadata sits on the cover sheet and each table on a sheet of
 * its own, so the locations issues are reported against follow that layout.
 *
 * @param {SummaryLogContentPayload} payload
 * @param {ReturnType<typeof templateForRegistration>} template
 * @returns {ParsedSummaryLog}
 */
const toParsedSummaryLog = ({ meta, data }, template) => ({
  meta: Object.fromEntries(
    Object.entries({ ...meta, ...template }).map(([key, value], index) => [
      key,
      { value, location: { sheet: COVER_SHEET, row: index + 1, column: 'B' } }
    ])
  ),
  data: Object.fromEntries(
    Object.entries(data).map(([table, { headers, rows }]) => [
      table,
      {
        location: { sheet: table, row: 1, column: 'A' },
        headers,
        rows: rows.map((values, index) => ({
          rowNumber: index + FIRST_DATA_ROW,
          values
        }))
      }
    ])
  )
})

/**
 * Runs a consumer command handler in-process: on a thrown error the handler's
 * own failure step marks the document, as the queue consumer would.
 *
 * @param {CommandHandler} handler
 * @param {ValidateCommandPayload | SubmitCommandPayload} payload
 * @param {SummaryLogHandlerDeps} deps
 */
const runCommand = async (handler, payload, deps) => {
  try {
    await handler.execute(payload, deps)
  } catch (error) {
    await handler.onFailure(payload, deps)
    throw Boom.boomify(error, {
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR
    })
  }
}

/**
 * Every answer after the insert names the document, so a caller can find what
 * its failed request left behind.
 *
 * @param {Error} error
 * @param {string} summaryLogId
 */
const naming = (error, summaryLogId) => {
  const boom = Boom.boomify(error)
  boom.output.payload.summaryLogId = summaryLogId
  return boom
}

/**
 * @typedef {HapiRequest<SummaryLogContentPayload> & SummaryLogHandlerSources & {
 *   params: { organisationId: string, registrationId: string, year: number },
 *   systemLogsRepository: SystemLogsRepository
 * }} SubmitRequest
 */

/**
 * Inserts the document an upload's completion would, validating against the
 * registration's latest submission.
 *
 * @param {SubmitRequest} request
 * @param {string} summaryLogId
 * @param {number} year
 * @param {string | null} accreditationId
 */
const insertValidatingLog = async (
  request,
  summaryLogId,
  year,
  accreditationId
) => {
  const { summaryLogsRepository } = request
  const { organisationId, registrationId } = request.params

  const latestSubmitted =
    await summaryLogsRepository.findLatestSubmittedForOrgReg({
      organisationId,
      registrationId,
      year,
      accreditationId
    })
  await summaryLogsRepository.insert(summaryLogId, {
    status: SUMMARY_LOG_STATUS.VALIDATING,
    expiresAt: calculateExpiresAt(SUMMARY_LOG_STATUS.VALIDATING),
    createdAt: new Date().toISOString(),
    file: { id: summaryLogId, name: 'summary-log.json' },
    organisationId,
    registrationId,
    year,
    accreditationId,
    validatedAgainstSummaryLogId: latestSubmitted?.id ?? NO_PRIOR_SUBMISSION
  })
}

/**
 * Submits a validated document as the submit route would, then runs the
 * consumer's submit step.
 *
 * @param {SubmitRequest} request
 * @param {SubmitCommandPayload} submitPayload
 * @param {SummaryLogHandlerDeps} deps
 * @returns {Promise<SummaryLogVersion>} The submitted document
 */
const submitValidatedLog = async (request, submitPayload, deps) => {
  const { summaryLogsRepository } = request
  const { organisationId, registrationId } = request.params
  const { summaryLogId } = submitPayload

  const transition =
    await summaryLogsRepository.transitionToSubmittingExclusive(summaryLogId)
  if (!transition.success) {
    throw Boom.conflict('Another submission is in progress. Please try again.')
  }

  const isStale = await supersedeIfStale({
    summaryLogsRepository,
    summaryLog: transition.summaryLog,
    summaryLogId,
    organisationId,
    registrationId,
    version: transition.version
  })
  if (isStale) {
    throw Boom.conflict('Waste records have changed since validation.')
  }

  await auditSummaryLogSubmit(request, {
    summaryLogId,
    organisationId,
    registrationId
  })

  await waitForVersion(summaryLogsRepository, summaryLogId, transition.version)
  await runCommand(submitSummaryLogCommand, submitPayload, deps)

  return waitForVersion(
    summaryLogsRepository,
    summaryLogId,
    transition.version + 1
  )
}

export const devSummaryLogsSubmitPath =
  '/v1/dev/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{year}'

/**
 * The template a payload's own meta picks: an ACCREDITATION_NUMBER means
 * accredited, its absence means registered-only — mirroring how a real
 * summary log declares its own template, independent of the route's params.
 *
 * @param {SummaryLogContentPayload} payload
 * @param {import('#domain/organisations/registration.js').Registration} registration
 * @returns {ReturnType<typeof templateForRegistration>}
 */
const templateFor = (payload, registration) =>
  templateForRegistration({
    ...registration,
    accreditation: payload.meta[SUMMARY_LOG_META_FIELDS.ACCREDITATION_NUMBER]
      ? {
          accreditationNumber: String(
            payload.meta[SUMMARY_LOG_META_FIELDS.ACCREDITATION_NUMBER]
          )
        }
      : null
  })

/**
 * @param {import('#domain/organisations/registration.js').Registration} registration
 * @returns {string | null}
 */
const accreditationIdFor = (registration) => {
  if (!isRegistrationAccredited(registration)) {
    return null
  }

  return /** @type {{ accreditation: { id: string } }} */ (registration)
    .accreditation.id
}

export const devSummaryLogsSubmit = {
  method: 'POST',
  path: devSummaryLogsSubmitPath,
  options: {
    auth: getAuthConfig([SCOPES.organisationWrite]),
    tags: ['api'],
    payload: { maxBytes: MAX_PAYLOAD_BYTES },
    validate: {
      params: summaryLogContentParamsSchema,
      payload: summaryLogContentPayloadSchema
    }
  },
  /**
   * @param {SubmitRequest} request
   * @param {import('#common/hapi-types.js').HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { summaryLogsRepository, organisationsRepository, payload, logger } =
      request
    const { organisationId, registrationId, year } = request.params
    const user = extractUser(request)
    const summaryLogId = randomUUID()

    const registration = await organisationsRepository.findRegistrationById(
      organisationId,
      registrationId
    )
    const parsed = toParsedSummaryLog(payload, templateFor(payload, registration))

    await insertValidatingLog(
      request,
      summaryLogId,
      year,
      accreditationIdFor(registration)
    )

    const deps = {
      logger,
      ...buildSummaryLogHandlerDeps(request),
      summaryLogExtractor: { extract: async () => parsed }
    }

    try {
      await waitForVersion(
        summaryLogsRepository,
        summaryLogId,
        INSERTED_VERSION
      )
      await runCommand(validateSummaryLogCommand, { summaryLogId }, deps)

      /** @type {SummaryLogVersion} */
      const validated = await waitForVersion(
        summaryLogsRepository,
        summaryLogId,
        VALIDATED_VERSION
      )
      if (validated.summaryLog.status !== SUMMARY_LOG_STATUS.VALIDATED) {
        return h
          .response({
            summaryLogId,
            ...toSummaryLogResponse(validated.summaryLog)
          })
          .code(StatusCodes.UNPROCESSABLE_ENTITY)
      }

      const submitted = await submitValidatedLog(
        request,
        { summaryLogId, user },
        deps
      )
      return h
        .response({
          summaryLogId,
          ...toSummaryLogResponse(submitted.summaryLog)
        })
        .code(StatusCodes.OK)
    } catch (error) {
      throw naming(error, summaryLogId)
    }
  }
}
