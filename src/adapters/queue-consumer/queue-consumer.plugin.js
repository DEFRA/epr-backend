import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { createSqsClient } from '#common/helpers/sqs/sqs-client.js'
import { createSummaryLogExtractor } from '#application/summary-logs/extractor.js'
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
    'uploadsRepository',
    'feature-flags'
  ],

  register: async (server, options) => {
    const { config } = options

    const awsRegion = config.get('awsRegion')
    const sqsEndpoint = config.get('commandQueue.endpoint')
    const queueName = config.get('commandQueue.queueName')

    const sqsClient = createSqsClient({
      region: awsRegion,
      endpoint: sqsEndpoint
    })

    const uploadsRepository = server.app.uploadsRepository

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

    // Consumer created lazily on server start to avoid SQS connection during tests
    let consumer = null

    // Start consuming on server start
    server.events.on('start', async () => {
      server.logger.info({
        message: 'Starting SQS command queue consumer',
        queueName,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.START_SUCCESS
        }
      })

      consumer = await createCommandQueueConsumer({
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

      if (consumer) {
        consumer.stop()
      }
      sqsClient.destroy()

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
