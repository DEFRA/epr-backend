import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { createSqsClient } from '#common/helpers/sqs/sqs-client.js'
import { createSqsCommandExecutor } from './sqs-command-executor.js'

export const sqsCommandExecutorPlugin = {
  name: 'sqs-command-executor',
  version: '1.0.0',

  register: async (server, options) => {
    const { config } = options

    const queueName = config.get('commandQueue.queueName')
    const awsRegion = config.get('awsRegion')
    const sqsEndpoint = config.get('commandQueue.endpoint')

    const sqsClient = createSqsClient({
      region: awsRegion,
      endpoint: sqsEndpoint
    })

    server.logger.info({
      message: 'Creating SQS command executor',
      queueName,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.START_SUCCESS
      }
    })

    const summaryLogsWorker = await createSqsCommandExecutor({
      sqsClient,
      queueName,
      logger: server.logger
    })

    server.decorate('request', 'summaryLogsWorker', () => summaryLogsWorker, {
      apply: true
    })

    // Clean up SQS client on server stop
    server.events.on('stop', () => {
      server.logger.info({
        message: 'Destroying SQS command executor client',
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.CONNECTION_CLOSING
        }
      })

      sqsClient.destroy()
    })
  }
}
