import { Consumer } from 'sqs-consumer'
import { GetQueueUrlCommand } from '@aws-sdk/client-sqs'

import { SUMMARY_LOG_COMMAND } from '#domain/summary-logs/status.js'

/**
 * Creates an SQS queue consumer for backend commands.
 *
 * @param {object} options
 * @param {import('@aws-sdk/client-sqs').SQSClient} options.sqsClient - SQS client instance
 * @param {string} options.queueName - Name of the queue to consume from
 * @param {object} options.logger - Pino logger instance
 * @param {Function} options.handleValidateCommand - Handler for validate commands
 * @param {Function} options.handleSubmitCommand - Handler for submit commands
 * @returns {Promise<Consumer>} Configured consumer (not yet started)
 */
export async function createCommandQueueConsumer({
  sqsClient,
  queueName,
  logger,
  handleValidateCommand,
  handleSubmitCommand
}) {
  // Look up queue URL by name at runtime
  const response = await sqsClient.send(
    new GetQueueUrlCommand({ QueueName: queueName })
  )

  const queueUrl = response.QueueUrl
  if (!queueUrl) {
    throw new Error(`Queue URL not found for queue: ${queueName}`)
  }

  logger.info({ queueName, queueUrl }, 'Resolved command queue URL')

  const consumer = Consumer.create({
    queueUrl,
    sqs: sqsClient,
    // @ts-ignore - sqs-consumer types expect Message return but void works fine
    handleMessage: async (message) => {
      const body = JSON.parse(/** @type {string} */ (message.Body))
      const { command, summaryLogId } = body

      logger.info(
        { command, summaryLogId, messageId: message.MessageId },
        'Processing command from queue'
      )

      switch (command) {
        case SUMMARY_LOG_COMMAND.VALIDATE:
          await handleValidateCommand({ summaryLogId })
          break

        case SUMMARY_LOG_COMMAND.SUBMIT:
          await handleSubmitCommand({ summaryLogId })
          break

        default:
          // Unknown command - log and delete (don't retry garbage)
          logger.warn(
            { command, summaryLogId },
            'Unknown command type, skipping'
          )
      }

      logger.info(
        { command, summaryLogId, messageId: message.MessageId },
        'Command processed successfully'
      )
    }
  })

  consumer.on('error', (err) => {
    logger.error({ error: err }, 'Command queue consumer error')
  })

  consumer.on('processing_error', (err) => {
    // Processing errors - message will be retried after visibility timeout
    logger.error({ error: err }, 'Command processing error')
  })

  consumer.on('started', () => {
    logger.info({ queueName }, 'Command queue consumer started')
  })

  consumer.on('stopped', () => {
    logger.info({ queueName }, 'Command queue consumer stopped')
  })

  return consumer
}
