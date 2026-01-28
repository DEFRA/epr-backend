import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { createSQSClient } from '#common/helpers/sqs/sqs-client.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { createCommandQueueConsumer } from '#workers/queue-consumer/consumer.js'
import { createCommandHandlers } from '#workers/queue-consumer/handlers.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createWasteRecordsRepository } from '#repositories/waste-records/mongodb.js'
import { createWasteBalancesRepository } from '#repositories/waste-balances/mongodb.js'
import { createUploadsRepository } from '#adapters/repositories/uploads/cdp-uploader.js'
import { createSummaryLogExtractor } from '#application/summary-logs/extractor.js'
import { createConfigFeatureFlags } from '#feature-flags/feature-flags.config.js'

export const queueConsumer = {
  plugin: {
    name: 'queue-consumer',
    version: '1.0.0',
    register: async (server, options) => {
      const { config } = options

      // Skip if explicitly disabled (e.g. for tests)
      if (options.skip) {
        server.logger.info('Queue consumer disabled, skipping registration')
        return
      }

      // Check if mongodb plugin is registered
      const hasMongoDb = server.registrations.mongodb !== undefined

      if (!hasMongoDb) {
        server.logger.warn(
          'MongoDB plugin not registered, queue consumer will not start'
        )
        return
      }

      // Wait for MongoDB to be ready before initialising the consumer
      server.dependency('mongodb', async () => {
        const queueName = config.get('commandQueue.name')
        const endpoint = config.get('commandQueue.endpoint')
        const region = config.get('awsRegion')

        const sqsClient = createSQSClient({ region, endpoint })

        // Create S3 client for uploads repository
        const s3Client = createS3Client({
          region: config.get('awsRegion'),
          endpoint: config.get('s3Endpoint'),
          forcePathStyle: config.get('isDevelopment')
        })

        // Create repositories using server.db and server.logger
        const summaryLogsRepository = (
          await createSummaryLogsRepository(server.db)
        )(server.logger)

        const organisationsRepository = (
          await createOrganisationsRepository(server.db)
        )()

        const wasteRecordsRepository = (
          await createWasteRecordsRepository(server.db)
        )()

        const wasteBalancesRepository = (
          await createWasteBalancesRepository(server.db, {
            organisationsRepository
          })
        )()

        const uploadsRepository = createUploadsRepository({
          s3Client,
          cdpUploaderUrl: config.get('cdpUploader.url'),
          s3Bucket: config.get('cdpUploader.s3Bucket')
        })

        const summaryLogExtractor = createSummaryLogExtractor({
          uploadsRepository,
          logger: server.logger
        })

        const featureFlags = createConfigFeatureFlags(config)

        const { handleValidateCommand, handleSubmitCommand } =
          createCommandHandlers({
            logger: server.logger,
            repositories: {
              summaryLogsRepository,
              organisationsRepository,
              wasteRecordsRepository,
              wasteBalancesRepository,
              summaryLogExtractor,
              featureFlags
            }
          })

        let consumer

        try {
          consumer = await createCommandQueueConsumer({
            sqsClient,
            queueName,
            logger: server.logger,
            handleValidateCommand,
            handleSubmitCommand
          })
        } catch (err) {
          server.logger.error(
            {
              error: err,
              queueName,
              event: {
                category: LOGGING_EVENT_CATEGORIES.SERVER,
                action: LOGGING_EVENT_ACTIONS.START_FAILURE
              }
            },
            'Failed to create command queue consumer'
          )
          sqsClient.destroy()
          s3Client.destroy()
          throw err
        }

        // Start consuming on server start
        server.events.on('start', () => {
          server.logger.info({
            message: 'Starting command queue consumer',
            queueName,
            event: {
              category: LOGGING_EVENT_CATEGORIES.SERVER,
              action: LOGGING_EVENT_ACTIONS.CONNECTION_INITIALISING
            }
          })

          consumer.start()
        })

        // Graceful shutdown: stop consumer before server closes
        server.events.on('stop', async () => {
          server.logger.info({
            message: 'Stopping command queue consumer',
            queueName,
            event: {
              category: LOGGING_EVENT_CATEGORIES.SERVER,
              action: LOGGING_EVENT_ACTIONS.CONNECTION_CLOSING
            }
          })

          try {
            consumer.stop()

            server.logger.info({
              message: 'Command queue consumer stopped',
              queueName,
              event: {
                category: LOGGING_EVENT_CATEGORIES.SERVER,
                action: LOGGING_EVENT_ACTIONS.CONNECTION_CLOSING_SUCCESS
              }
            })
          } catch (err) {
            /* v8 ignore next 10 */
            server.logger.error({
              error: err,
              message: 'Failed to stop command queue consumer',
              queueName,
              event: {
                category: LOGGING_EVENT_CATEGORIES.SERVER,
                action: LOGGING_EVENT_ACTIONS.CONNECTION_CLOSING_FAILURE
              }
            })
          } finally {
            sqsClient.destroy()
            s3Client.destroy()
          }
        })
      })
    }
  }
}
