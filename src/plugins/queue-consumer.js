import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { createSQSClient } from '#common/helpers/sqs/sqs-client.js'
import { createCommandQueueConsumer } from '#workers/queue-consumer/consumer.js'
import { createCommandHandlers } from '#workers/queue-consumer/handlers.js'

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

      const queueName = config.get('commandQueue.name')
      const endpoint = config.get('commandQueue.endpoint')
      const region = config.get('awsRegion')

      const sqsClient = createSQSClient({ region, endpoint })

      const { handleValidateCommand, handleSubmitCommand } =
        createCommandHandlers({ logger: server.logger })

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
        }
      })
    }
  }
}
