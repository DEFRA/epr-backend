import { Consumer } from 'sqs-consumer'
import { GetQueueUrlCommand } from '@aws-sdk/client-sqs'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import {
  SUMMARY_LOG_COMMAND,
  SUMMARY_LOG_STATUS,
  PROCESSING_STATUSES,
  SUBMISSION_PROCESSING_STATUSES,
  transitionStatus
} from '#domain/summary-logs/status.js'
import { SUMMARY_LOG_META_FIELDS } from '#domain/summary-logs/meta-fields.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { syncFromSummaryLog } from '#application/waste-records/sync-from-summary-log.js'
import { summaryLogMetrics } from '#common/helpers/metrics/summary-logs.js'

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
 * Marks a summary log as validation_failed if it's still in a processing state.
 * @param {string} summaryLogId
 * @param {object} repository
 * @param {object} logger
 */
const markAsValidationFailed = async (summaryLogId, repository, logger) => {
  try {
    const result = await repository.findById(summaryLogId)

    if (!result) {
      logger.warn({
        message: `Cannot mark as validation_failed: summary log not found`,
        summaryLogId
      })
      return
    }

    const { version, summaryLog } = result

    if (!PROCESSING_STATUSES.includes(summaryLog.status)) {
      return
    }

    await repository.update(
      summaryLogId,
      version,
      transitionStatus(summaryLog, SUMMARY_LOG_STATUS.VALIDATION_FAILED)
    )
  } catch (err) {
    logger.error({
      err,
      message: `Failed to mark summary log as validation_failed`,
      summaryLogId
    })
  }
}

/**
 * Marks a summary log as submission_failed if it's still in submitting state.
 * @param {string} summaryLogId
 * @param {object} repository
 * @param {object} logger
 */
const markAsSubmissionFailed = async (summaryLogId, repository, logger) => {
  try {
    const result = await repository.findById(summaryLogId)

    if (!result) {
      logger.warn({
        message: `Cannot mark as submission_failed: summary log not found`,
        summaryLogId
      })
      return
    }

    const { version, summaryLog } = result

    if (!SUBMISSION_PROCESSING_STATUSES.includes(summaryLog.status)) {
      return
    }

    await repository.update(
      summaryLogId,
      version,
      transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMISSION_FAILED)
    )
  } catch (err) {
    logger.error({
      err,
      message: `Failed to mark summary log as submission_failed`,
      summaryLogId
    })
  }
}

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
  const {
    logger,
    summaryLogsRepository,
    organisationsRepository,
    wasteRecordsRepository,
    wasteBalancesRepository,
    summaryLogExtractor,
    featureFlags
  } = deps

  const existing = await summaryLogsRepository.findById(summaryLogId)

  if (!existing) {
    throw new Error(`Summary log ${summaryLogId} not found`)
  }

  const { version, summaryLog } = existing

  if (summaryLog.status !== SUMMARY_LOG_STATUS.SUBMITTING) {
    throw new Error(
      `Summary log must be in submitting status. Current status: ${summaryLog.status}`
    )
  }

  const processingType =
    summaryLog.meta?.[SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]

  const sync = syncFromSummaryLog({
    extractor: summaryLogExtractor,
    wasteRecordRepository: wasteRecordsRepository,
    wasteBalancesRepository,
    organisationsRepository,
    featureFlags
  })

  const { created, updated } = await summaryLogMetrics.timedSubmission(
    { processingType },
    () => sync(summaryLog)
  )

  await summaryLogMetrics.recordWasteRecordsCreated({ processingType }, created)
  await summaryLogMetrics.recordWasteRecordsUpdated({ processingType }, updated)

  await summaryLogsRepository.update(
    summaryLogId,
    version,
    transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMITTED)
  )

  await summaryLogMetrics.recordStatusTransition({
    status: SUMMARY_LOG_STATUS.SUBMITTED,
    processingType
  })

  logger.info({
    message: `Summary log submitted: summaryLogId=${summaryLogId}`
  })
}

/**
 * Creates the message handler for the SQS consumer.
 * @param {ConsumerDependencies} deps
 * @returns {(message: import('@aws-sdk/client-sqs').Message) => Promise<void>}
 */
const createMessageHandler = (deps) => async (message) => {
  const { logger, summaryLogsRepository } = deps

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
    // Delete malformed messages - no point retrying
    return
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
    // Delete invalid messages - no point retrying
    return
  }

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
        // Delete unknown commands - no point retrying
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

    // Mark as failed (permanent failure) and delete message
    switch (commandType) {
      case SUMMARY_LOG_COMMAND.VALIDATE:
        await markAsValidationFailed(summaryLogId, summaryLogsRepository, logger)
        break

      case SUMMARY_LOG_COMMAND.SUBMIT:
        await markAsSubmissionFailed(summaryLogId, summaryLogsRepository, logger)
        break
    }

    // Message will be deleted after handler returns (success path)
    // If we wanted to retry, we'd throw here instead
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
