import { Consumer } from 'sqs-consumer'
import { GetQueueUrlCommand } from '@aws-sdk/client-sqs'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { SUMMARY_LOG_COMMAND } from '#domain/summary-logs/status.js'
import {
  markAsValidationFailed,
  markAsSubmissionFailed
} from '#domain/summary-logs/mark-as-failed.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { submitSummaryLog } from '#application/summary-logs/submit.js'

/** @typedef {import('@aws-sdk/client-sqs').SQSClient} SQSClient */

/**
 * @typedef {object} CommandMessage
 * @property {string} command - 'validate' or 'submit'
 * @property {string} summaryLogId - The summary log ID to process
 */

/**
 * @typedef {object} ConsumerDependencies
 * @property {SQSClient} sqsClient
 * @property {string} queueName
 * @property {object} logger
 * @property {object} summaryLogsRepository
 * @property {object} organisationsRepository
 * @property {object} wasteRecordsRepository
 * @property {object} wasteBalancesRepository
 * @property {object} summaryLogExtractor
 * @property {object} featureFlags
 */

/**
 * Handles a validate command.
 * @param {string} summaryLogId
 * @param {ConsumerDependencies} deps
 */
const handleValidateCommand = async (summaryLogId, deps) => {
  const {
    summaryLogsRepository,
    organisationsRepository,
    wasteRecordsRepository,
    summaryLogExtractor
  } = deps

  const validateSummaryLog = createSummaryLogsValidator({
    summaryLogsRepository,
    organisationsRepository,
    wasteRecordsRepository,
    summaryLogExtractor
  })

  await validateSummaryLog(summaryLogId)
}

/**
 * Handles a submit command.
 * @param {string} summaryLogId
 * @param {ConsumerDependencies} deps
 */
const handleSubmitCommand = async (summaryLogId, deps) => {
  await submitSummaryLog(summaryLogId, deps)
}

/**
 * Parses and validates a command message from SQS.
 * @param {import('@aws-sdk/client-sqs').Message} message
 * @param {object} logger
 * @returns {CommandMessage | null} The parsed command, or null if invalid
 */
const parseCommandMessage = (message, logger) => {
  /** @type {CommandMessage} */
  let command

  try {
    command = JSON.parse(message.Body ?? '{}')
  } catch {
    logger.error({
      message: 'Failed to parse SQS message body',
      messageId: message.MessageId,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })
    return null
  }

  const { command: commandType, summaryLogId } = command

  if (!commandType || !summaryLogId) {
    logger.error({
      message: 'Invalid command message: missing command or summaryLogId',
      messageId: message.MessageId,
      command,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })
    return null
  }

  return command
}

/**
 * Marks a summary log as failed based on the command type.
 * @param {string} commandType
 * @param {string} summaryLogId
 * @param {object} summaryLogsRepository
 * @param {object} logger
 */
const markCommandAsFailed = async (
  commandType,
  summaryLogId,
  summaryLogsRepository,
  logger
) => {
  switch (commandType) {
    case SUMMARY_LOG_COMMAND.VALIDATE:
      await markAsValidationFailed(summaryLogId, summaryLogsRepository, logger)
      break

    case SUMMARY_LOG_COMMAND.SUBMIT:
      await markAsSubmissionFailed(summaryLogId, summaryLogsRepository, logger)
      break
  }
}

/**
 * Creates the message handler for the SQS consumer.
 * @param {ConsumerDependencies} deps
 * @returns {(message: import('@aws-sdk/client-sqs').Message) => Promise<void>}
 */
const createMessageHandler = (deps) => async (message) => {
  const { logger, summaryLogsRepository } = deps

  const command = parseCommandMessage(message, logger)
  if (!command) {
    return
  }

  const { command: commandType, summaryLogId } = command

  logger.info({
    message: `Processing command: ${commandType} for summaryLogId=${summaryLogId}`,
    messageId: message.MessageId,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.START_SUCCESS
    }
  })

  try {
    switch (commandType) {
      case SUMMARY_LOG_COMMAND.VALIDATE:
        await handleValidateCommand(summaryLogId, deps)
        break

      case SUMMARY_LOG_COMMAND.SUBMIT:
        await handleSubmitCommand(summaryLogId, deps)
        break

      default:
        logger.error({
          message: `Unknown command type: ${commandType}`,
          summaryLogId,
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
          }
        })
        return
    }

    logger.info({
      message: `Command completed: ${commandType} for summaryLogId=${summaryLogId}`,
      messageId: message.MessageId,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
      }
    })
  } catch (err) {
    logger.error({
      err,
      message: `Command failed: ${commandType} for summaryLogId=${summaryLogId}`,
      messageId: message.MessageId,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })

    await markCommandAsFailed(
      commandType,
      summaryLogId,
      summaryLogsRepository,
      logger
    )
  }
}

/**
 * Creates and starts the SQS command queue consumer.
 * @param {ConsumerDependencies} deps
 * @returns {Promise<Consumer>}
 */
export const createCommandQueueConsumer = async (deps) => {
  const { sqsClient, queueName, logger } = deps

  // Look up queue URL by name
  const getQueueUrlCommand = new GetQueueUrlCommand({ QueueName: queueName })
  const { QueueUrl: queueUrl } = await sqsClient.send(getQueueUrlCommand)

  if (!queueUrl) {
    throw new Error(`Queue not found: ${queueName}`)
  }

  logger.info({
    message: `Resolved queue URL: ${queueUrl}`,
    queueName,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.CONNECTION_SUCCESS
    }
  })

  const consumer = Consumer.create({
    queueUrl,
    sqs: sqsClient,
    handleMessage: /** @type {*} */ (createMessageHandler(deps))
  })

  consumer.on('error', (err) => {
    logger.error({
      err,
      message: 'SQS consumer error',
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.CONNECTION_FAILURE
      }
    })
  })

  consumer.on('processing_error', (err) => {
    logger.error({
      err,
      message: 'SQS message processing error',
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })
  })

  return consumer
}
