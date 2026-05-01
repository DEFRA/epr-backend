import { SendMessageCommand } from '@aws-sdk/client-sqs'
import { getTraceId } from '@defra/hapi-tracing'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { resolveQueueUrl } from '#common/helpers/sqs/sqs-client.js'
import { SUMMARY_LOG_COMMAND } from '#domain/summary-logs/status.js'
import { ORS_IMPORT_COMMAND } from '#overseas-sites/domain/import-status.js'

/**
 * @import { SQSClient } from '@aws-sdk/client-sqs'
 * @import { TypedLogger } from '#common/hapi-types.js'
 * @import { SummaryLogsCommandExecutor } from '#domain/summary-logs/worker/port.js'
 * @import { OrsImportsCommandExecutor } from '#overseas-sites/imports/worker/port.js'
 */

/**
 * @typedef {object} ExecutorDependencies
 * @property {SQSClient} sqsClient
 * @property {string} queueName
 * @property {object} logger
 */

/**
 * Projects the authenticated request's credentials into the shape the SQS
 * message carries. The submit route is gated to standard_user scope, so the
 * union is narrowed to human credentials at the boundary.
 *
 * @param {import('#common/hapi-types.js').HapiRequest} request
 * @returns {import('#domain/summary-logs/worker/port.js').SubmitUser}
 */
const extractUser = (request) => {
  const { credentials } = request.auth
  if (!('email' in credentials)) {
    throw new Error(
      'Machine credentials cannot drive a summary-log submit; route requires standard_user scope'
    )
  }
  return {
    id: credentials.id,
    // @ts-expect-error narrowed to HumanCredentials by `email in credentials` above; tsc loses the discriminant through Hapi's base Request intersection
    email: credentials.email,
    // @ts-expect-error narrowed to HumanCredentials by `email in credentials` above; tsc loses the discriminant through Hapi's base Request intersection
    scope: credentials.scope
  }
}

/**
 * Builds the message context object containing observability data.
 * Separated from domain payload so consumers can strip it before dispatch.
 * @returns {{ traceId: string } | undefined}
 */
const buildContext = () => {
  const traceId = getTraceId()
  if (!traceId) {
    return undefined
  }
  return { traceId }
}

/**
 * Sends a command message to the SQS queue.
 * @param {string} queueUrl
 * @param {SQSClient} sqsClient
 * @param {TypedLogger} logger
 * @param {string} command
 * @param {object} payload
 * @param {string} description
 */
const sendCommandMessage = async (
  queueUrl,
  sqsClient,
  logger,
  command,
  payload,
  description
) => {
  const context = buildContext()
  const messageBody = { command, ...payload, ...(context && { context }) }

  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(messageBody)
    })
  )

  logger.info({
    message: `Sent ${command} command for ${description}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })
}

/**
 * Creates SQS-based command executors for summary logs and ORS imports.
 *
 * These executors send command messages to an SQS queue, which are then
 * processed by the queue consumer. This enables async processing and
 * decouples the HTTP request from long-running operations.
 *
 * @param {ExecutorDependencies} deps
 * @returns {Promise<{summaryLogsWorker: SummaryLogsCommandExecutor, orsImportsWorker: OrsImportsCommandExecutor}>}
 */
export const createSqsCommandExecutor = async (deps) => {
  const { sqsClient, queueName, logger } = deps

  const queueUrl = await resolveQueueUrl(sqsClient, queueName)

  logger.info({
    message: `Resolved queue URL: ${queueUrl}`,
    queueName
  })

  return {
    summaryLogsWorker: {
      validate: async (summaryLogId) => {
        await sendCommandMessage(
          queueUrl,
          sqsClient,
          logger,
          SUMMARY_LOG_COMMAND.VALIDATE,
          { summaryLogId },
          `summaryLogId=${summaryLogId}`
        )
      },
      submit: async (summaryLogId, request) => {
        await sendCommandMessage(
          queueUrl,
          sqsClient,
          logger,
          SUMMARY_LOG_COMMAND.SUBMIT,
          { summaryLogId, user: extractUser(request) },
          `summaryLogId=${summaryLogId}`
        )
      }
    },
    orsImportsWorker: {
      importOverseasSites: async (importId, user) => {
        const payload = user ? { importId, user } : { importId }

        await sendCommandMessage(
          queueUrl,
          sqsClient,
          logger,
          ORS_IMPORT_COMMAND.IMPORT_OVERSEAS_SITES,
          payload,
          `importId=${importId}`
        )
      }
    }
  }
}
