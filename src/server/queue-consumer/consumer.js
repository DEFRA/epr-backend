import { Consumer } from 'sqs-consumer'

import {
  resolveQueueUrl,
  getMaxReceiveCount
} from '#common/helpers/sqs/sqs-client.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { COMMAND_TYPE } from '#domain/commands/types.js'
import { validateCommandMessage } from '#domain/commands/schemas.js'
import {
  markAsSubmissionFailed,
  markAsValidationFailed
} from '#domain/summary-logs/mark-as-failed.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { submitSummaryLog } from '#application/summary-logs/submit.js'
import { recalculateWasteBalancesForAccreditation } from '#application/waste-balances/recalculate-for-accreditation.js'
import { PermanentError } from '#server/queue-consumer/permanent-error.js'

/** @typedef {import('@aws-sdk/client-sqs').SQSClient} SQSClient */
/** @typedef {import('#common/helpers/logging/logger.js').TypedLogger} TypedLogger */

const ONE_MINUTE = 60_000
const COMMAND_TIMEOUT_MINUTES = 5
const COMMAND_TIMEOUT_MS = COMMAND_TIMEOUT_MINUTES * ONE_MINUTE

/**
 * @typedef {object} CommandHandler
 * @property {(command: object, deps: ConsumerDependencies) => Promise<void>} execute
 * @property {((command: object, deps: ConsumerDependencies) => Promise<void>)?} [onFailure]
 */

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
 * Registry of command handlers keyed by command type.
 *
 * Each handler has an `execute` function and an optional `onFailure`
 * callback invoked when the command fails terminally (permanent error
 * or final transient attempt).
 *
 * @type {Record<string, CommandHandler>}
 */
const commandHandlers = {
  [COMMAND_TYPE.VALIDATE]: {
    execute: async (command, deps) => {
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
  },

  [COMMAND_TYPE.RECALCULATE_BALANCE]: {
    execute: async (command, deps) => {
      await recalculateWasteBalancesForAccreditation({
        organisationId: command.organisationId,
        accreditationId: command.accreditationId,
        registrationId: command.registrationId,
        wasteRecordsRepository: deps.wasteRecordsRepository,
        wasteBalancesRepository: deps.wasteBalancesRepository,
        logger: deps.logger
      })
    }
    // No onFailure: there is no summary log to mark as failed
  }
}

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
 * Maps command fields to their log-friendly identifier labels.
 * Order matters: the first matching field is used.
 */
const COMMAND_IDENTIFIERS = [
  { field: 'summaryLogId', label: 'summaryLogId' },
  { field: 'accreditationId', label: 'accreditationId' }
]

/**
 * Formats a log-friendly description of the command for messages.
 * @param {object} command - The validated command message
 * @returns {string}
 */
const describeCommand = (command) => {
  const match = COMMAND_IDENTIFIERS.find((id) => command[id.field])
  return match
    ? `${command.command} for ${match.label}=${command[match.field]}`
    : /* v8 ignore next */ command.command
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
 * Handles a command processing error: logs, invokes the handler's
 * onFailure if terminal, and rethrows transient errors so SQS can retry.
 * @param {object} params
 * @param {Error} params.err
 * @param {object} params.command
 * @param {import('@aws-sdk/client-sqs').Message} params.message
 * @param {number|null} params.maxReceiveCount
 * @param {ConsumerDependencies} params.deps
 */
const handleCommandError = async ({
  err,
  command,
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
    message: `Command failed (${getFailureLabel(isPermanent, isFinalTransientAttempt)}): ${describeCommand(command)} messageId=${message.MessageId}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
    }
  })

  if (isTerminal) {
    const handler = commandHandlers[command.command]
    if (handler?.onFailure) {
      await handler.onFailure(command, deps)
    }
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

  const command = parseCommandMessage(message, logger)
  if (!command) {
    throw new Error(
      `Unparseable command message, messageId=${message.MessageId}`
    )
  }

  const handler = commandHandlers[command.command]

  /* c8 ignore next 5 - defensive: schema validation ensures only registered commands reach here */
  if (!handler) {
    throw new Error(
      `No handler registered for command: ${command.command}, messageId=${message.MessageId}`
    )
  }

  logger.info({
    message: `Processing command: ${describeCommand(command)} messageId=${message.MessageId}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.START_SUCCESS
    }
  })

  try {
    await handler.execute(command, deps)

    logger.info({
      message: `Command completed: ${describeCommand(command)} messageId=${message.MessageId}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
      }
    })

    return message
  } catch (err) {
    await handleCommandError({
      err,
      command,
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
    const command = parseCommandMessage(message, logger)

    logger.error({
      err,
      message: command
        ? `Command timed out: ${describeCommand(command)} messageId=${message.MessageId}`
        : `Command timed out for messageId=${message.MessageId}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })

    if (command) {
      const handler = commandHandlers[command.command]
      if (handler?.onFailure) {
        await handler.onFailure(command, deps)
      }
    }
  })

  return consumer
}
