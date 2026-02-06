import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { createSqsClient } from '#common/helpers/sqs/sqs-client.js'
import { createUploadsRepository } from '#adapters/repositories/uploads/cdp-uploader.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createWasteRecordsRepository } from '#repositories/waste-records/mongodb.js'
import { createWasteBalancesRepository } from '#repositories/waste-balances/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { createCommandQueueConsumer } from './consumer.js'

export const commandQueueConsumerPlugin = {
  name: 'command-queue-consumer',
  version: '1.0.0',
  dependencies: ['mongodb'],

  register: async (server, options) => {
    const { config } = options

    const queueName = config.get('commandQueue.queueName')
    const awsRegion = config.get('awsRegion')
    const sqsEndpoint = config.get('commandQueue.endpoint')
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

    // Create repository factories from db - repos will be instantiated per-message
    // with message-scoped loggers (like worker-thread.js pattern)
    const db = server.db
    const summaryLogsRepositoryFactory = await createSummaryLogsRepository(db)
    const organisationsRepositoryFactory =
      await createOrganisationsRepository(db)
    const wasteRecordsRepositoryFactory = await createWasteRecordsRepository(db)
    const systemLogsRepositoryFactory = await createSystemLogsRepository(db)
    const wasteBalancesRepositoryFactory = await createWasteBalancesRepository(
      db,
      {
        organisationsRepository: organisationsRepositoryFactory(),
        systemLogsRepository: systemLogsRepositoryFactory(server.logger)
      }
    )

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
        uploadsRepository,
        summaryLogsRepositoryFactory,
        organisationsRepositoryFactory,
        wasteRecordsRepositoryFactory,
        wasteBalancesRepositoryFactory
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
