import { SendMessageCommand } from '@aws-sdk/client-sqs'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { resolveQueueUrl } from '#common/helpers/sqs/sqs-client.js'
import { COMMAND_TYPE } from '#domain/commands/schemas.js'

/** @typedef {import('@aws-sdk/client-sqs').SQSClient} SQSClient */
/** @typedef {import('#domain/summary-logs/worker/port.js').SummaryLogsCommandExecutor} SummaryLogsCommandExecutor */

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
 * @param {object} messageBody - The full command message body
 * @param {string} logDescription - Human-readable description for logging
 */
const sendCommandMessage = async (
  queueUrl,
  sqsClient,
  logger,
  messageBody,
  logDescription
) => {
  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(messageBody)
    })
  )

  logger.info({
    message: `Sent ${logDescription}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })
}

/**
 * Creates an SQS-based summary logs command executor.
 *
 * This executor sends command messages to an SQS queue, which are then
 * processed by the queue consumer. This enables async processing and
 * decouples the HTTP request from the long-running validation/submission.
 *
 * @param {ExecutorDependencies} deps
 * @returns {Promise<SummaryLogsCommandExecutor>}
 */
export const createSqsCommandExecutor = async (deps) => {
  const { sqsClient, queueName, logger } = deps

  const queueUrl = await resolveQueueUrl(sqsClient, queueName)

  logger.info({
    message: `Resolved queue URL: ${queueUrl}`,
    queueName
  })

  return {
    validate: async (summaryLogId) => {
      await sendCommandMessage(
        queueUrl,
        sqsClient,
        logger,
        { command: COMMAND_TYPE.VALIDATE, summaryLogId },
        `${COMMAND_TYPE.VALIDATE} command for summaryLogId=${summaryLogId}`
      )
    },
    submit: async (summaryLogId, request) => {
      const user = extractUser(request)
      const messageBody = { command: COMMAND_TYPE.SUBMIT, summaryLogId }

      if (user) {
        messageBody.user = user
      }

      await sendCommandMessage(
        queueUrl,
        sqsClient,
        logger,
        messageBody,
        `${COMMAND_TYPE.SUBMIT} command for summaryLogId=${summaryLogId}`
      )
    },
    recalculateBalance: async (accreditationId) => {
      await sendCommandMessage(
        queueUrl,
        sqsClient,
        logger,
        { command: COMMAND_TYPE.RECALCULATE_BALANCE, accreditationId },
        `${COMMAND_TYPE.RECALCULATE_BALANCE} command for accreditationId=${accreditationId}`
      )
    }
  }
}
