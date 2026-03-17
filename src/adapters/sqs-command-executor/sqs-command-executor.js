import { SendMessageCommand } from '@aws-sdk/client-sqs'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { resolveQueueUrl } from '#common/helpers/sqs/sqs-client.js'
import { SUMMARY_LOG_COMMAND } from '#domain/summary-logs/status.js'
import { ORS_IMPORT_COMMAND } from '#overseas-sites/domain/import-status.js'

/** @typedef {import('@aws-sdk/client-sqs').SQSClient} SQSClient */
/** @typedef {import('#domain/summary-logs/worker/port.js').SummaryLogsCommandExecutor} SummaryLogsCommandExecutor */
/** @typedef {import('#overseas-sites/imports/worker/port.js').OrsImportsCommandExecutor} OrsImportsCommandExecutor */

/**
 * @typedef {object} ExecutorDependencies
 * @property {SQSClient} sqsClient
 * @property {string} queueName
 * @property {object} logger
 */

/**
 * Extracts user context from a Hapi request for serialisation.
 * @param {object} [request]
 * @returns {{ id: string, email: string, scope: string[] } | undefined}
 */
const extractUser = (request) => {
  const credentials = request?.auth?.credentials
  if (!credentials) {
    return undefined
  }

  return {
    id: credentials.id,
    email: credentials.email,
    scope: credentials.scope
  }
}

/**
 * Sends a command message to the SQS queue.
 * @param {string} queueUrl
 * @param {SQSClient} sqsClient
 * @param {object} logger
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
  const messageBody = { command, ...payload }

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
        const user = extractUser(request)
        const payload = user ? { summaryLogId, user } : { summaryLogId }

        await sendCommandMessage(
          queueUrl,
          sqsClient,
          logger,
          SUMMARY_LOG_COMMAND.SUBMIT,
          payload,
          `summaryLogId=${summaryLogId}`
        )
      }
    },
    orsImportsWorker: {
      importOverseasSites: async (importId) => {
        await sendCommandMessage(
          queueUrl,
          sqsClient,
          logger,
          ORS_IMPORT_COMMAND.IMPORT_OVERSEAS_SITES,
          { importId },
          `importId=${importId}`
        )
      }
    }
  }
}
