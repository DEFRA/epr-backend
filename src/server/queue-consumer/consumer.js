import { Consumer } from 'sqs-consumer'

import {
  resolveQueueUrl,
  getMaxReceiveCount
} from '#common/helpers/sqs/sqs-client.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import {
  COMMAND_TYPE,
  validateCommandMessage
} from '#domain/commands/schemas.js'
import {
  markAsSubmissionFailed,
  markAsValidationFailed
} from '#domain/summary-logs/mark-as-failed.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { submitSummaryLog } from '#application/summary-logs/submit.js'
import { PermanentError } from '#server/queue-consumer/permanent-error.js'

/** @typedef {import('@aws-sdk/client-sqs').SQSClient} SQSClient */
/** @typedef {import('#common/helpers/logging/logger.js').TypedLogger} TypedLogger */

const ONE_MINUTE = 60_000
const COMMAND_TIMEOUT_MINUTES = 5
const COMMAND_TIMEOUT_MS = COMMAND_TIMEOUT_MINUTES * ONE_MINUTE

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
 * @typedef {object} CommandHandler
 * @property {(command: object, deps: ConsumerDependencies) => Promise<void>} execute
 * @property {(command: object, deps: ConsumerDependencies) => Promise<void>} [onFailure]
 */

/** @type {Record<string, CommandHandler>} */
const commandHandlers = {
  [COMMAND_TYPE.VALIDATE]: {
    execute: async (command, deps) => {
      const validateSummaryLog = createSummaryLogsValidator({
        summaryLogsRepository: deps.summaryLogsRepository,
        organisationsRepository: deps.organisationsRepository,
        wasteRecordsRepository: deps.wasteRecordsRepository,
        summaryLogExtractor: deps.summaryLogExtractor
      })
      await validateSummaryLog(command.summaryLogId)
    },
    onFailure: async (command, deps) => {
      await markAsValidationFailed(
        command.summaryLogId,
        deps.summaryLogsRepository,
        deps.logger
      )
    }
  },
  [COMMAND_TYPE.SUBMIT]: {
    execute: async (command, deps) => {
      await submitSummaryLog(command.summaryLogId, {
        ...deps,
        user: command.user
      })
    },
    onFailure: async (command, deps) => {
      await markAsSubmissionFailed(
        command.summaryLogId,
        deps.summaryLogsRepository,
        deps.logger
      )
    }
  }
}

/**
 * Returns a log-friendly description of a command.
 * @param {object} command
 * @returns {string}
 */
const describeCommand = (command) =>
  `${command.command} for summaryLogId=${command.summaryLogId}`

/**
 * Parses and validates a command message from SQS.
 * @param {import('@aws-sdk/client-sqs').Message} message
 * @param {TypedLogger} logger
 * @returns {object | null} The parsed command, or null if invalid
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

  const { error, value } = validateCommandMessage(parsed)

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
 * Returns a label describing the failure mode for logging.
 * @param {boolean} isPermanent
 * @param {boolean} isFinalTransientAttempt
 * @returns {string}
 */
const getFailureLabel = (isPermanent, isFinalTransientAttempt) => {
  if (isPermanent) {
    return 'permanent'
  }
  if (isFinalTransientAttempt) {
    return 'transient, final attempt'
  }
  return 'transient, will retry'
}

/**
 * Handles a command processing error: logs, marks as failed if terminal,
 * and rethrows transient errors so SQS can retry.
 * @param {object} params
 * @param {Error} params.err
 * @param {object} params.parsedCommand
 * @param {CommandHandler} params.handler
 * @param {import('@aws-sdk/client-sqs').Message} params.message
 * @param {number|null} params.maxReceiveCount
 * @param {ConsumerDependencies} params.deps
 */
const handleCommandError = async ({
  err,
  parsedCommand,
  handler,
  message,
  maxReceiveCount,
  deps
}) => {
  const { logger } = deps
  const isPermanent = err instanceof PermanentError
  const receiveCount = Number(message.Attributes?.ApproximateReceiveCount ?? 0)
  const isFinalTransientAttempt =
    !isPermanent && maxReceiveCount !== null && receiveCount >= maxReceiveCount
  const isTerminal = isPermanent || isFinalTransientAttempt

  logger.error({
    err,
    message: `Command failed (${getFailureLabel(isPermanent, isFinalTransientAttempt)}): ${describeCommand(parsedCommand)} messageId=${message.MessageId}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
    }
  })

  if (isTerminal) {
    await handler.onFailure(parsedCommand, deps)
  }

  if (isPermanent) {
    return
  }
  throw err
}

/**
 * Creates the message handler for the SQS consumer.
 * @param {ConsumerDependencies} deps
 * @param {number|null} maxReceiveCount
 * @returns {(message: import('@aws-sdk/client-sqs').Message) => Promise<import('@aws-sdk/client-sqs').Message | void>}
 */
const createMessageHandler = (deps, maxReceiveCount) => async (message) => {
  const { logger } = deps

  const parsedCommand = parseCommandMessage(message, logger)
  if (!parsedCommand) {
    throw new Error(
      `Unparseable command message, messageId=${message.MessageId}`
    )
  }

  const handler = commandHandlers[parsedCommand.command]

  logger.info({
    message: `Processing command: ${describeCommand(parsedCommand)} messageId=${message.MessageId}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.START_SUCCESS
    }
  })

  try {
    await handler.execute(parsedCommand, deps)

    logger.info({
      message: `Command completed: ${describeCommand(parsedCommand)} messageId=${message.MessageId}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
      }
    })

    return message
  } catch (err) {
    await handleCommandError({
      err,
      parsedCommand,
      handler,
      message,
      maxReceiveCount,
      deps
    })

    // handleCommandError returns (rather than throwing) for permanent errors,
    // so acknowledge the message to prevent SQS retrying it
    return message
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

  const maxReceiveCount = await getMaxReceiveCount(sqsClient, queueUrl)

  if (maxReceiveCount === null) {
    logger.warn({
      message: `No redrive policy configured for queueName=${queueName}; transient errors on final retry will not be marked as failed`
    })
  } else {
    logger.info({
      message: `Queue redrive policy: maxReceiveCount=${maxReceiveCount} for queueName=${queueName}`
    })
  }

  const consumer = Consumer.create({
    queueUrl,
    sqs: sqsClient,
    handleMessage: /** @type {*} */ (
      createMessageHandler(deps, maxReceiveCount)
    ),
    handleMessageTimeout: COMMAND_TIMEOUT_MS,
    attributeNames: /** @type {*} */ (['ApproximateReceiveCount'])
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
    const parsedCommand = parseCommandMessage(message, logger)

    logger.error({
      err,
      message: parsedCommand
        ? `Command timed out: ${describeCommand(parsedCommand)} messageId=${message.MessageId}`
        : `Command timed out for messageId=${message.MessageId}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })

    if (parsedCommand) {
      const handler = commandHandlers[parsedCommand.command]
      await handler.onFailure(parsedCommand, deps)
    }
  })

  return consumer
}
