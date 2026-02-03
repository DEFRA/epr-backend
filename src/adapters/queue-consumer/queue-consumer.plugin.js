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
    'summaryLogsRepository',
    'organisationsRepository',
    'wasteRecordsRepository',
    'wasteBalancesRepository',
    'uploadsRepository',
    'feature-flags'
  ],

  register: async (server, options) => {
    const { config } = options

    const queueUrl = config.get('commandQueue.url')

    if (!queueUrl) {
      server.logger.info({
        message: 'SQS command queue consumer disabled (no queue URL configured)'
      })
      return
    }

    const awsRegion = config.get('awsRegion')
    const sqsEndpoint = config.get('commandQueue.endpoint')

    const sqsClient = createSqsClient({
      region: awsRegion,
      endpoint: sqsEndpoint
    })

    // Access deps registered by other plugins
    const {
      uploadsRepository,
      summaryLogsRepository,
      organisationsRepository,
      wasteRecordsRepository,
      wasteBalancesRepository,
      featureFlags
    } = server.app

    const summaryLogExtractor = createSummaryLogExtractor({
      uploadsRepository,
      logger: server.logger
    })

    // Consumer created lazily on server start to avoid SQS connection during tests
    let consumer = null

    // Start consuming on server start
    server.events.on('start', () => {
      server.logger.info({
        message: 'Starting SQS command queue consumer',
        queueUrl,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.START_SUCCESS
        }
      })

      consumer = createCommandQueueConsumer({
        sqsClient,
        queueUrl,
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
