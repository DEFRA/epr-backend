import Joi from 'joi'
import { Consumer } from 'sqs-consumer'

import { resolveQueueUrl } from '#common/helpers/sqs/sqs-client.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { SUMMARY_LOG_COMMAND } from '#domain/summary-logs/status.js'
import {
  markAsSubmissionFailed,
  markAsValidationFailed
} from '#domain/summary-logs/mark-as-failed.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { createSummaryLogExtractor } from '#application/summary-logs/extractor.js'
import { submitSummaryLog } from '#application/summary-logs/submit.js'

/** @typedef {import('@aws-sdk/client-sqs').SQSClient} SQSClient */

/**
 * @typedef {object} CommandMessage
 * @property {string} command - 'validate' or 'submit'
 * @property {string} summaryLogId - The summary log ID to process
 * @property {object} [user] - Optional user context for audit trail
 */

const userSchema = Joi.object({
  id: Joi.string().required(),
  email: Joi.string().required(),
  scope: Joi.array().items(Joi.string()).required()
})

const commandMessageSchema = Joi.object({
  command: Joi.string()
    .valid(SUMMARY_LOG_COMMAND.VALIDATE, SUMMARY_LOG_COMMAND.SUBMIT)
    .required(),
  summaryLogId: Joi.string().required(),
  user: userSchema.optional()
})

/**
 * @typedef {object} ConsumerDependencies
 * @property {SQSClient} sqsClient
 * @property {string} queueName
 * @property {object} logger - Base logger (will create child loggers per message)
 * @property {object} uploadsRepository
 * @property {Function} summaryLogsRepositoryFactory - Factory: (logger) => repo
 * @property {Function} organisationsRepositoryFactory - Factory: () => repo
 * @property {Function} wasteRecordsRepositoryFactory - Factory: () => repo
 * @property {Function} wasteBalancesRepositoryFactory - Factory: () => repo
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
 * Parses and validates a command message from SQS.
 * @param {import('@aws-sdk/client-sqs').Message} message
 * @param {object} logger
 * @returns {CommandMessage | null} The parsed command, or null if invalid
 */
const parseCommandMessage = (message, logger) => {
  let parsed

  try {
    parsed = JSON.parse(message.Body ?? '{}')
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

  const { error, value } = commandMessageSchema.validate(parsed)

  if (error) {
    logger.error({
      message: `Invalid command message: ${error.message}`,
      messageId: message.MessageId,
      command: parsed,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })
    return null
  }

  return value
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
  if (commandType === SUMMARY_LOG_COMMAND.VALIDATE) {
    await markAsValidationFailed(summaryLogId, summaryLogsRepository, logger)
  }
  // Separate if rather than else-if: createMessageHandler validates command
  // type before calling this function, so both conditions are independent
  if (commandType === SUMMARY_LOG_COMMAND.SUBMIT) {
    await markAsSubmissionFailed(summaryLogId, summaryLogsRepository, logger)
  }
}

/**
 * Creates message-scoped dependencies for processing a single SQS message.
 * Each message gets its own logger and repository instances for correlation.
 * @param {ConsumerDependencies} deps - Base dependencies with factories
 * @param {string} messageId - SQS message ID for correlation
 * @returns {object} Message-scoped dependencies
 */
const createMessageDependencies = (deps, messageId) => {
  const {
    logger: baseLogger,
    uploadsRepository,
    summaryLogsRepositoryFactory,
    organisationsRepositoryFactory,
    wasteRecordsRepositoryFactory,
    wasteBalancesRepositoryFactory
  } = deps

  // Create message-scoped logger for correlation
  const logger = baseLogger.child({ messageId })

  // Instantiate repos with message-scoped logger
  const summaryLogsRepository = summaryLogsRepositoryFactory(logger)
  const organisationsRepository = organisationsRepositoryFactory()
  const wasteRecordsRepository = wasteRecordsRepositoryFactory()
  const wasteBalancesRepository = wasteBalancesRepositoryFactory()

  // Create extractor with message-scoped logger
  const summaryLogExtractor = createSummaryLogExtractor({
    uploadsRepository,
    logger
  })

  return {
    logger,
    summaryLogsRepository,
    organisationsRepository,
    wasteRecordsRepository,
    wasteBalancesRepository,
    summaryLogExtractor
  }
}

/**
 * Creates the message handler for the SQS consumer.
 * @param {ConsumerDependencies} deps
 * @returns {(message: import('@aws-sdk/client-sqs').Message) => Promise<void>}
 */
const createMessageHandler = (deps) => async (message) => {
  const { logger: baseLogger } = deps
  const messageId = message.MessageId

  const command = parseCommandMessage(message, baseLogger)
  if (!command) {
    return
  }

  // Create message-scoped dependencies for this message
  const messageDeps = createMessageDependencies(deps, messageId)
  const { logger, summaryLogsRepository } = messageDeps

  const { command: commandType, summaryLogId } = command

  logger.info({
    message: `Processing command: ${commandType} for summaryLogId=${summaryLogId}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.START_SUCCESS
    }
  })

  try {
    switch (commandType) {
      case SUMMARY_LOG_COMMAND.VALIDATE:
        await handleValidateCommand(summaryLogId, messageDeps)
        break

      case SUMMARY_LOG_COMMAND.SUBMIT:
        await submitSummaryLog(summaryLogId, {
          ...messageDeps,
          user: command.user
        })
        break
    }

    logger.info({
      message: `Command completed: ${commandType} for summaryLogId=${summaryLogId}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
      }
    })
  } catch (err) {
    logger.error({
      err,
      message: `Command failed: ${commandType} for summaryLogId=${summaryLogId}`,
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
 * Creates the SQS command queue consumer.
 * @param {ConsumerDependencies} deps
 * @returns {Promise<Consumer>}
 */
export const createCommandQueueConsumer = async (deps) => {
  const { sqsClient, queueName, logger } = deps

  const queueUrl = await resolveQueueUrl(sqsClient, queueName)

  logger.info({
    message: `Resolved queue URL: ${queueUrl}`,
    queueName
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
