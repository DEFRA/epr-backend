import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import {
  createSqsClient,
  resolveDlqUrl,
  getApproximateMessageCount,
  purgeQueue
} from '#common/helpers/sqs/sqs-client.js'

/**
 * @typedef {Object} DlqAdminPluginOptions
 * @property {{get: (key: string) => string}} config
 */

export const dlqAdminPlugin = {
  name: 'dlq-admin',
  version: '1.0.0',

  register: async (
    /** @type {import('#common/hapi-types.js').HapiServer} */ server,
    /** @type {DlqAdminPluginOptions} */ options
  ) => {
    const { config } = options

    const sqsClient = createSqsClient({
      region: config.get('awsRegion'),
      endpoint: config.get('commandQueue.endpoint')
    })

    const dlqUrl = await resolveDlqUrl(
      sqsClient,
      config.get('commandQueue.queueName')
    )

    server.logger.info({
      message: `DLQ admin connected: ${dlqUrl}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.START_SUCCESS
      }
    })

    const dlqService = {
      getStatus: () =>
        getApproximateMessageCount(sqsClient, dlqUrl).then(
          (approximateMessageCount) => ({ approximateMessageCount })
        ),
      purge: () => purgeQueue(sqsClient, dlqUrl)
    }

    server.decorate('request', 'dlqService', () => dlqService, { apply: true })

    server.events.on('stop', () => {
      server.logger.info({
        message: 'Destroying DLQ admin SQS client',
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.CONNECTION_CLOSING
        }
      })

      sqsClient.destroy()
    })
  }
}
