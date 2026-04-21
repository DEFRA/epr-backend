import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { createSqsClient } from '#common/helpers/sqs/sqs-client.js'
import { getDlqUrl, getDlqStatus, purgeDlq } from './dlq-service.js'

/**
 * @typedef {Object} DlqServicePluginOptions
 * @property {{get: (key: string) => string}} config
 */

export const dlqServicePlugin = {
  name: 'dlq-service',
  version: '1.0.0',

  register: async (
    /** @type {import('#common/hapi-types.js').HapiServer} */ server,
    /** @type {DlqServicePluginOptions} */ options
  ) => {
    const { config } = options

    const sqsClient = createSqsClient({
      region: config.get('awsRegion'),
      endpoint: config.get('commandQueue.endpoint')
    })

    const dlqUrl = await getDlqUrl(
      sqsClient,
      config.get('commandQueue.queueName')
    )

    server.logger.info({
      message: `DLQ service connected: ${dlqUrl}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.START_SUCCESS
      }
    })

    const dlqService = {
      getStatus: () => getDlqStatus(sqsClient, dlqUrl),
      purge: () => purgeDlq(sqsClient, dlqUrl)
    }

    server.decorate('request', 'dlqService', () => dlqService, { apply: true })

    server.events.on('stop', () => {
      server.logger.info({
        message: 'Destroying DLQ service SQS client',
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.CONNECTION_CLOSING
        }
      })

      sqsClient.destroy()
    })
  }
}
