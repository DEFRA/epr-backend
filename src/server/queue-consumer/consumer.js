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
import { submitSummaryLog } from '#application/summary-logs/submit.js'
import { PermanentError } from '#domain/summary-logs/permanent-error.js'

/** @typedef {import('@aws-sdk/client-sqs').SQSClient} SQSClient */
/** @typedef {import('#common/helpers/logging/logger.js').TypedLogger} TypedLogger */

const ONE_MINUTE = 60_000
const COMMAND_TIMEOUT_MINUTES = 5
const COMMAND_TIMEOUT_MS = COMMAND_TIMEOUT_MINUTES * ONE_MINUTE

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
 * @property {TypedLogger} logger
 * @property {object} summaryLogsRepository
 * @property {object} organisationsRepository
 * @property {object} wasteRecordsRepository
 * @property {object} wasteBalancesRepository
 * @property {object} summaryLogExtractor
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
 * @param {TypedLogger} logger
 * @returns {CommandMessage | null} The parsed command, or null if invalid
 */
const parseCommandMessage = (message, logger) => {
  let parsed

  const messageId = message.MessageId ?? 'unknown'

  try {
    parsed = JSON.parse(message.Body ?? '{}')
  } catch {
    logger.error({
      message: `Failed to parse SQS message body for messageId=${messageId}`,
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
      message: `Invalid command message for messageId=${messageId}: ${error.message}`,
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
 * @param {TypedLogger} logger
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
    message: `Processing command: ${commandType} for summaryLogId=${summaryLogId} messageId=${message.MessageId}`,
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
        await submitSummaryLog(summaryLogId, { ...deps, user: command.user })
        break

      /* c8 ignore next 2 - unreachable: Joi validation ensures only valid commands reach here */
      default:
        return
    }

    logger.info({
      message: `Command completed: ${commandType} for summaryLogId=${summaryLogId} messageId=${message.MessageId}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
      }
    })
  } catch (err) {
    if (err instanceof PermanentError) {
      logger.error({
        err,
        message: `Command failed (permanent): ${commandType} for summaryLogId=${summaryLogId} messageId=${message.MessageId}`,
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
      return
    }

    logger.error({
      err,
      message: `Command failed (transient, will retry): ${commandType} for summaryLogId=${summaryLogId} messageId=${message.MessageId}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })

    throw err
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
    message: `Resolved queue URL: ${queueUrl} for queueName=${queueName}`
  })

  const consumer = Consumer.create({
    queueUrl,
    sqs: sqsClient,
    handleMessage: /** @type {*} */ (createMessageHandler(deps)),
    handleMessageTimeout: COMMAND_TIMEOUT_MS
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

  consumer.on('timeout_error', async (err, message) => {
    const command = parseCommandMessage(message, logger)

    logger.error({
      err,
      message: command
        ? `Command timed out: ${command.command} for summaryLogId=${command.summaryLogId} messageId=${message.MessageId}`
        : `Command timed out for messageId=${message.MessageId}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })

    if (command) {
      await markCommandAsFailed(
        command.command,
        command.summaryLogId,
        deps.summaryLogsRepository,
        logger
      )
    }
  })

  return consumer
}
