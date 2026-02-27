import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { createSqsClient } from '#common/helpers/sqs/sqs-client.js'
import { createOrsQueueConsumer } from './consumer.js'

/**
 * @typedef {Object} OrsQueueConsumerPluginOptions
 * @property {{get: (key: string) => string}} config
 */

export const orsQueueConsumerPlugin = {
  name: 'ors-queue-consumer',
  version: '1.0.0',
  dependencies: [
    'orsImportsRepository',
    'overseasSitesRepository',
    'organisationsRepository',
    'uploadsRepository'
  ],

  register: async (
    /** @type {import('#common/hapi-types.js').HapiServer} */ server,
    /** @type {OrsQueueConsumerPluginOptions} */ options
  ) => {
    const { config } = options

    const queueName = config.get('orsImportQueue.queueName')
    const awsRegion = config.get('awsRegion')
    const sqsEndpoint = config.get('orsImportQueue.endpoint')

    const sqsClient = createSqsClient({
      region: awsRegion,
      endpoint: sqsEndpoint
    })

    const {
      orsImportsRepository,
      uploadsRepository,
      overseasSitesRepository,
      organisationsRepository
    } = server.app

    let consumer = null

    server.events.on('start', async () => {
      server.logger.info({
        message: `Starting ORS SQS queue consumer for queue: ${queueName}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.START_SUCCESS
        }
      })

      consumer = await createOrsQueueConsumer({
        sqsClient,
        queueName,
        logger: server.logger,
        orsImportsRepository,
        uploadsRepository,
        overseasSitesRepository,
        organisationsRepository
      })

      consumer.start()
    })

    server.events.on('stop', async () => {
      server.logger.info({
        message: 'Stopping ORS SQS queue consumer',
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
        message: 'ORS SQS queue consumer stopped',
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.CONNECTION_CLOSING_SUCCESS
        }
      })
    })
  }
}
