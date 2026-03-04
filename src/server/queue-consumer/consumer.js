import Joi from 'joi'
import { Consumer } from 'sqs-consumer'

import {
  resolveQueueUrl,
  getMaxReceiveCount
} from '#common/helpers/sqs/sqs-client.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { PermanentError } from '#server/queue-consumer/permanent-error.js'

/** @typedef {import('@aws-sdk/client-sqs').SQSClient} SQSClient */
/** @typedef {import('#common/helpers/logging/logger.js').TypedLogger} TypedLogger */
/** @typedef {import('./summary-log-commands.js').CommandHandler} CommandHandler */

const ONE_MINUTE = 60_000
const COMMAND_TIMEOUT_MINUTES = 5
const COMMAND_TIMEOUT_MS = COMMAND_TIMEOUT_MINUTES * ONE_MINUTE

/**
 * @typedef {object} ConsumerDependencies
 * @property {SQSClient} sqsClient
 * @property {string} queueName
 * @property {TypedLogger} logger
 */

/**
 * Builds the envelope Joi schema dynamically from registered handlers.
 * Validates the `command` field against known handler commands, then
 * defers payload validation to the matched handler's payloadSchema.
 * @param {CommandHandler[]} handlers
 * @returns {{ envelopeSchema: import('joi').ObjectSchema, handlerMap: Map<string, CommandHandler> }}
 */
const buildSchemas = (handlers) => {
  const handlerMap = new Map(handlers.map((h) => [h.command, h]))
  const validCommands = handlers.map((h) => h.command)

  const envelopeSchema = Joi.object({
    command: Joi.string()
      .valid(...validCommands)
      .required()
  }).options({ allowUnknown: true })

  return { envelopeSchema, handlerMap }
}

/**
 * Parses and validates a command message from SQS.
 *
 * Two-pass validation:
 * 1. Envelope: validates the `command` field is a known command
 * 2. Payload: validates remaining fields against the handler's payloadSchema
 *
 * @param {import('@aws-sdk/client-sqs').Message} message
 * @param {TypedLogger} logger
 * @param {import('joi').ObjectSchema} envelopeSchema
 * @param {Map<string, CommandHandler>} handlerMap
 * @returns {{ handler: CommandHandler, payload: object } | null}
 */
const parseCommandMessage = (message, logger, envelopeSchema, handlerMap) => {
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

  // Pass 1: validate envelope (command field)
  const { error: envelopeError } = envelopeSchema.validate(parsed)

  if (envelopeError) {
    logger.error({
      message: `Invalid command message for messageId=${messageId}: ${envelopeError.message}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })
    return null
  }

  const { command, ...rest } = parsed
  const handler = /** @type {CommandHandler} */ (handlerMap.get(command))

  // Pass 2: validate payload against handler's schema
  const { error: payloadError, value: payload } =
    handler.payloadSchema.validate(rest)

  if (payloadError) {
    logger.error({
      message: `Invalid command message for messageId=${messageId}: ${payloadError.message}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })
    return null
  }

  return { handler, payload }
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
 * @param {CommandHandler} params.handler
 * @param {object} params.payload
 * @param {import('@aws-sdk/client-sqs').Message} params.message
 * @param {number|null} params.maxReceiveCount
 * @param {object} params.deps
 * @param {TypedLogger} params.logger
 */
const handleCommandError = async ({
  err,
  handler,
  payload,
  message,
  maxReceiveCount,
  deps,
  logger
}) => {
  const isPermanent = err instanceof PermanentError
  const receiveCount = Number(message.Attributes?.ApproximateReceiveCount ?? 0)
  const isFinalTransientAttempt =
    !isPermanent && maxReceiveCount !== null && receiveCount >= maxReceiveCount
  const isTerminal = isPermanent || isFinalTransientAttempt

  logger.error({
    err,
    message: `Command failed (${getFailureLabel(isPermanent, isFinalTransientAttempt)}): ${handler.command} for ${handler.describe(payload)} messageId=${message.MessageId}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
    }
  })

  if (isTerminal) {
    await handler.onFailure(payload, deps)
  }

  if (isPermanent) {
    return
  }
  throw err
}

/**
 * Creates the message handler for the SQS consumer.
 * @param {object} deps
 * @param {number|null} maxReceiveCount
 * @param {import('joi').ObjectSchema} envelopeSchema
 * @param {Map<string, CommandHandler>} handlerMap
 * @returns {(message: import('@aws-sdk/client-sqs').Message) => Promise<import('@aws-sdk/client-sqs').Message | void>}
 */
const createMessageHandler =
  (deps, maxReceiveCount, envelopeSchema, handlerMap) => async (message) => {
    const { logger } = deps

    const result = parseCommandMessage(
      message,
      logger,
      envelopeSchema,
      handlerMap
    )
    if (!result) {
      throw new Error(
        `Unparseable command message, messageId=${message.MessageId}`
      )
    }

    const { handler, payload } = result

    logger.info({
      message: `Processing command: ${handler.command} for ${handler.describe(payload)} messageId=${message.MessageId}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.START_SUCCESS
      }
    })

    try {
      await handler.execute(payload, deps)

      logger.info({
        message: `Command completed: ${handler.command} for ${handler.describe(payload)} messageId=${message.MessageId}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
        }
      })

      return message
    } catch (err) {
      await handleCommandError({
        err,
        handler,
        payload,
        message,
        maxReceiveCount,
        deps,
        logger
      })

      // handleCommandError returns (rather than throwing) for permanent errors,
      // so acknowledge the message to prevent SQS retrying it
      return message
    }
  }

/**
 * Creates the SQS command queue consumer.
 *
 * `deps` must include the consumer's own dependencies (sqsClient, queueName,
 * logger) **plus** whatever the registered handlers require. The consumer
 * passes the entire bag through to handler.execute() and handler.onFailure().
 *
 * @template {ConsumerDependencies} D
 * @param {D} deps
 * @param {CommandHandler[]} handlers - Registered command handlers
 * @returns {Promise<Consumer>}
 */
export const createCommandQueueConsumer = async (deps, handlers) => {
  if (!handlers.length) {
    throw new Error('At least one command handler must be registered')
  }

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

  const { envelopeSchema, handlerMap } = buildSchemas(handlers)

  const consumer = Consumer.create({
    queueUrl,
    sqs: sqsClient,
    handleMessage: /** @type {*} */ (
      createMessageHandler(deps, maxReceiveCount, envelopeSchema, handlerMap)
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
    const result = parseCommandMessage(
      message,
      logger,
      envelopeSchema,
      handlerMap
    )

    logger.error({
      err,
      message: result
        ? `Command timed out: ${result.handler.command} for ${result.handler.describe(result.payload)} messageId=${message.MessageId}`
        : `Command timed out for messageId=${message.MessageId}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })

    if (result) {
      await result.handler.onFailure(result.payload, deps)
    }
  })

  return consumer
}
