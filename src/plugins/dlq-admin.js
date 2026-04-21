import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import {
  createSqsClient,
  resolveDlqUrl,
  getApproximateMessageCount,
  receiveMessages,
  purgeQueue
} from '#common/helpers/sqs/sqs-client.js'

/**
 * @typedef {Object} DlqAdminPluginOptions
 * @property {{get: (key: string) => string}} config
 */

/**
 * @typedef {Object} DlqMessage
 * @property {string} messageId
 * @property {string} sentTimestamp - ISO 8601 timestamp
 * @property {number} approximateReceiveCount
 * @property {object|null} command - Parsed message body, or null if not valid JSON
 * @property {string} body - Raw message body
 */

/**
 * @typedef {Object} DlqMessagesResult
 * @property {number} approximateMessageCount
 * @property {DlqMessage[]} messages
 */

/**
 * @typedef {Object} DlqService
 * @property {() => Promise<DlqMessagesResult>} getMessages
 * @property {() => Promise<void>} purge
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

    /** @type {DlqService} */
    const dlqService = {
      getMessages: async () => {
        const [approximateMessageCount, rawMessages] = await Promise.all([
          getApproximateMessageCount(sqsClient, dlqUrl),
          receiveMessages(sqsClient, dlqUrl)
        ])

        const messages = rawMessages.map((msg) => {
          let command = null
          try {
            command = JSON.parse(msg.body)
          } catch {
            // body is not valid JSON — leave command as null
          }

          return { ...msg, command }
        })

        return { approximateMessageCount, messages }
      },
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
