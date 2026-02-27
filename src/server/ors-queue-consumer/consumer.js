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
import {
  ORS_IMPORT_COMMAND,
  ORS_IMPORT_STATUS
} from '#domain/overseas-sites/import-status.js'
import { PermanentError } from '#server/queue-consumer/permanent-error.js'
import { processOrsImport } from '#application/overseas-sites/process-import.js'

const ONE_MINUTE = 60_000
const COMMAND_TIMEOUT_MINUTES = 5
const COMMAND_TIMEOUT_MS = COMMAND_TIMEOUT_MINUTES * ONE_MINUTE

const commandMessageSchema = Joi.object({
  command: Joi.string().valid(ORS_IMPORT_COMMAND.PROCESS).required(),
  importId: Joi.string().required()
})

/**
 * @param {import('@aws-sdk/client-sqs').Message} message
 * @param {object} logger
 * @returns {{command: string, importId: string} | null}
 */
const parseCommandMessage = (message, logger) => {
  const messageId = message.MessageId ?? 'unknown'

  let parsed
  try {
    parsed = JSON.parse(message.Body ?? '{}')
  } catch {
    logger.error({
      message: `Failed to parse ORS SQS message body for messageId=${messageId}`,
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
      message: `Invalid ORS command message for messageId=${messageId}: ${error.message}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })
    return null
  }

  return value
}

const markImportAsFailed = async (importId, orsImportsRepository, logger) => {
  try {
    await orsImportsRepository.updateStatus(importId, ORS_IMPORT_STATUS.FAILED)
  } catch (err) {
    logger.error({
      err,
      message: `Failed to mark ORS import ${importId} as failed`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })
  }
}

const createMessageHandler = (deps, maxReceiveCount) => async (message) => {
  const {
    logger,
    orsImportsRepository,
    uploadsRepository,
    overseasSitesRepository,
    organisationsRepository
  } = deps

  const command = parseCommandMessage(message, logger)
  if (!command) {
    throw new Error(
      `Unparseable command message, messageId=${message.MessageId}`
    )
  }

  const { importId } = command

  logger.info({
    message: `Processing ORS import: importId=${importId} messageId=${message.MessageId}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.START_SUCCESS
    }
  })

  try {
    await processOrsImport(importId, {
      orsImportsRepository,
      uploadsRepository,
      overseasSitesRepository,
      organisationsRepository,
      logger
    })

    logger.info({
      message: `ORS import completed: importId=${importId} messageId=${message.MessageId}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
      }
    })

    return message
  } catch (err) {
    const isPermanent = err instanceof PermanentError
    const receiveCount = Number(
      message.Attributes?.ApproximateReceiveCount ?? 0
    )
    const isFinalTransientAttempt =
      !isPermanent &&
      maxReceiveCount !== null &&
      receiveCount >= maxReceiveCount
    const isTerminal = isPermanent || isFinalTransientAttempt

    logger.error({
      err,
      message: `ORS import failed: importId=${importId} messageId=${message.MessageId}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })

    if (isTerminal) {
      await markImportAsFailed(importId, orsImportsRepository, logger)
    }

    if (isPermanent) {
      return message
    }
    throw err
  }
}

/**
 * Creates the SQS queue consumer for ORS import processing.
 *
 * @param {object} deps
 * @returns {Promise<Consumer>}
 */
export const createOrsQueueConsumer = async (deps) => {
  const { sqsClient, queueName, logger } = deps

  const queueUrl = await resolveQueueUrl(sqsClient, queueName)

  logger.info({
    message: `Resolved ORS queue URL: ${queueUrl} for queueName=${queueName}`
  })

  const maxReceiveCount = await getMaxReceiveCount(sqsClient, queueUrl)

  if (maxReceiveCount === null) {
    logger.warn({
      message: `No redrive policy configured for ORS queue queueName=${queueName}`
    })
  } else {
    logger.info({
      message: `ORS queue redrive policy: maxReceiveCount=${maxReceiveCount} for queueName=${queueName}`
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
      message: 'ORS SQS consumer error',
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.CONNECTION_FAILURE
      }
    })
  })

  consumer.on('processing_error', (err) => {
    logger.error({
      err,
      message: 'ORS SQS message processing error',
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
        ? `ORS import timed out: importId=${command.importId} messageId=${message.MessageId}`
        : `ORS import timed out for messageId=${message.MessageId}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })

    if (command) {
      await markImportAsFailed(
        command.importId,
        deps.orsImportsRepository,
        logger
      )
    }
  })

  return consumer
}
