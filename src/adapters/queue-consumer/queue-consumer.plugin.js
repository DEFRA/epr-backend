import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { createSqsClient } from '#common/helpers/sqs/sqs-client.js'
import { createSummaryLogExtractor } from '#application/summary-logs/extractor.js'
import { createUploadsRepository } from '#adapters/repositories/uploads/cdp-uploader.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { createCommandQueueConsumer } from './consumer.js'

export const commandQueueConsumerPlugin = {
  name: 'command-queue-consumer',
  version: '1.0.0',
  dependencies: [
    'mongodb',
    'summaryLogsRepository',
    'organisationsRepository',
    'wasteRecordsRepository',
    'wasteBalancesRepository',
    'feature-flags'
  ],

  register: async (server, options) => {
    const { config } = options

    const awsRegion = config.get('awsRegion')
    const sqsEndpoint = config.get('commandQueue.endpoint')
    const queueName = config.get('commandQueue.queueName')
    const s3Endpoint = config.get('s3Endpoint')
    const isDevelopment = config.get('isDevelopment')

    const sqsClient = createSqsClient({
      region: awsRegion,
      endpoint: sqsEndpoint
    })

    const s3Client = createS3Client({
      region: awsRegion,
      endpoint: s3Endpoint,
      forcePathStyle: isDevelopment
    })

    const uploadsRepository = createUploadsRepository({
      s3Client,
      cdpUploaderUrl: config.get('cdpUploader.url'),
      s3Bucket: config.get('cdpUploader.s3Bucket')
    })

    const summaryLogExtractor = createSummaryLogExtractor({
      uploadsRepository,
      logger: server.logger
    })

    // Access repositories registered by other plugins
    const summaryLogsRepository = server.app.summaryLogsRepository
    const organisationsRepository = server.app.organisationsRepository
    const wasteRecordsRepository = server.app.wasteRecordsRepository
    const wasteBalancesRepository = server.app.wasteBalancesRepository

    // Access feature flags
    const featureFlags = server.app.featureFlags

    const consumer = await createCommandQueueConsumer({
      sqsClient,
      queueName,
      logger: server.logger,
      summaryLogsRepository,
      organisationsRepository,
      wasteRecordsRepository,
      wasteBalancesRepository,
      summaryLogExtractor,
      featureFlags
    })

    // Start consuming on server start
    server.events.on('start', () => {
      server.logger.info({
        message: 'Starting SQS command queue consumer',
        queueName,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.START_SUCCESS
        }
      })

      consumer.start()
    })

    // Stop consuming on server stop (graceful shutdown)
    server.events.on('stop', async () => {
      server.logger.info({
        message: 'Stopping SQS command queue consumer',
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.CONNECTION_CLOSING
        }
      })

      consumer.stop()
      sqsClient.destroy()
      s3Client.destroy()

      server.logger.info({
        message: 'SQS command queue consumer stopped',
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.CONNECTION_CLOSING_SUCCESS
        }
      })
    })
  }
}
