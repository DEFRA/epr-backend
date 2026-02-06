import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { createSqsClient } from '#common/helpers/sqs/sqs-client.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { createSummaryLogExtractor } from '#application/summary-logs/extractor.js'
import { createCommandQueueConsumer } from './consumer.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createWasteRecordsRepository } from '#repositories/waste-records/mongodb.js'
import { createWasteBalancesRepository } from '#repositories/waste-balances/mongodb.js'
import { createUploadsRepository } from '#adapters/repositories/uploads/cdp-uploader.js'

/**
 * @typedef {Object} CommandQueueConsumerPluginOptions
 * @property {{get: (key: string) => string}} config
 */

export const commandQueueConsumerPlugin = {
  name: 'command-queue-consumer',
  version: '1.0.0',
  dependencies: ['mongodb'],

  register: async (
    /** @type {import('#common/hapi-types.js').HapiServer} */ server,
    /** @type {CommandQueueConsumerPluginOptions} */ options
  ) => {
    const { config } = options

    const queueName = config.get('commandQueue.queueName')
    const awsRegion = config.get('awsRegion')
    const sqsEndpoint = config.get('commandQueue.endpoint')

    const sqsClient = createSqsClient({
      region: awsRegion,
      endpoint: sqsEndpoint
    })

    // Create repository instances directly - the queue consumer runs outside
    // request context so cannot use the request-scoped repository plugins
    const s3Client = createS3Client({
      region: awsRegion,
      endpoint: config.get('s3Endpoint'),
      forcePathStyle: config.get('isDevelopment')
    })

    const uploadsRepository = createUploadsRepository({
      s3Client,
      cdpUploaderUrl: config.get('cdpUploader.url'),
      s3Bucket: config.get('cdpUploader.s3Bucket')
    })

    const summaryLogsRepository = await createSummaryLogsRepository(
      server.db,
      server.logger
    )

    const organisationsFactory = await createOrganisationsRepository(server.db)
    const organisationsRepository = organisationsFactory()

    const wasteRecordsFactory = await createWasteRecordsRepository(server.db)
    const wasteRecordsRepository = wasteRecordsFactory()

    const wasteBalancesFactory = await createWasteBalancesRepository(
      server.db,
      { organisationsRepository }
    )
    const wasteBalancesRepository = wasteBalancesFactory()

    const summaryLogExtractor = createSummaryLogExtractor({
      uploadsRepository,
      logger: server.logger
    })

    // Consumer created lazily on server start to avoid SQS connection during tests
    let consumer = null

    // Start consuming on server start
    server.events.on('start', async () => {
      server.logger.info({
        message: `Starting SQS command queue consumer for queue: ${queueName}`,
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
        summaryLogExtractor
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
