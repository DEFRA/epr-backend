import {
  SQSClient,
  GetQueueUrlCommand,
  GetQueueAttributesCommand,
  PurgeQueueCommand,
  ReceiveMessageCommand
} from '@aws-sdk/client-sqs'

/** @typedef {import('@aws-sdk/client-sqs').SQSClient} SQSClientType */

export function createSqsClient({ region, endpoint, credentials = undefined }) {
  const config = {
    region,
    ...(endpoint ? { endpoint } : {}),
    ...(credentials ? { credentials } : {})
  }

  return new SQSClient(config)
}

/**
 * Resolves a queue URL from a queue name.
 * @param {SQSClientType} sqsClient
 * @param {string} queueName
 * @returns {Promise<string>}
 */
export async function resolveQueueUrl(sqsClient, queueName) {
  const command = new GetQueueUrlCommand({ QueueName: queueName })
  const { QueueUrl: queueUrl } = await sqsClient.send(command)

  /* c8 ignore next 3 - defensive: SDK throws QueueDoesNotExist before returning null */
  if (!queueUrl) {
    throw new Error(`Queue not found: ${queueName}`)
  }

  return queueUrl
}

/**
 * Reads the maxReceiveCount from a queue's redrive policy.
 * @param {SQSClientType} sqsClient
 * @param {string} queueUrl
 * @returns {Promise<number|null>} maxReceiveCount, or null if no redrive policy
 */
export async function getMaxReceiveCount(sqsClient, queueUrl) {
  const command = new GetQueueAttributesCommand({
    QueueUrl: queueUrl,
    AttributeNames: ['RedrivePolicy']
  })

  const { Attributes: attributes } = await sqsClient.send(command)
  const redrivePolicy = attributes?.RedrivePolicy

  if (!redrivePolicy) {
    return null
  }

  const parsed = JSON.parse(redrivePolicy)
  return Number(parsed.maxReceiveCount)
}

/**
 * Resolves the DLQ URL by reading the redrive policy of the main queue.
 * @param {SQSClientType} sqsClient
 * @param {string} mainQueueName
 * @returns {Promise<string>}
 */
export async function resolveDlqUrl(sqsClient, mainQueueName) {
  const mainQueueUrl = await resolveQueueUrl(sqsClient, mainQueueName)

  const { Attributes: attributes } = await sqsClient.send(
    new GetQueueAttributesCommand({
      QueueUrl: mainQueueUrl,
      AttributeNames: ['RedrivePolicy']
    })
  )

  const redrivePolicy = attributes?.RedrivePolicy

  if (!redrivePolicy) {
    throw new Error(`No redrive policy found on queue: ${mainQueueName}`)
  }

  const { deadLetterTargetArn } = JSON.parse(redrivePolicy)
  const dlqName = deadLetterTargetArn.split(':').at(-1)

  return resolveQueueUrl(sqsClient, dlqName)
}

/**
 * Returns the approximate number of messages in a queue.
 * @param {SQSClientType} sqsClient
 * @param {string} queueUrl
 * @returns {Promise<number>}
 */
export async function getApproximateMessageCount(sqsClient, queueUrl) {
  const { Attributes: attributes } = await sqsClient.send(
    new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ['ApproximateNumberOfMessages']
    })
  )

  /* c8 ignore next - defensive: SDK always returns the requested attribute */
  return Number.parseInt(attributes?.ApproximateNumberOfMessages ?? '0', 10)
}

/**
 * Purges all messages from a queue.
 * @param {SQSClientType} sqsClient
 * @param {string} queueUrl
 * @returns {Promise<void>}
 */
export async function purgeQueue(sqsClient, queueUrl) {
  await sqsClient.send(new PurgeQueueCommand({ QueueUrl: queueUrl }))
}

/**
 * Receives messages from a queue, deduplicating by MessageId.
 * Loops ReceiveMessage calls until an empty response or the maxMessages cap.
 * @param {SQSClientType} sqsClient
 * @param {string} queueUrl
 * @param {Object} [options]
 * @param {number} [options.maxMessages=100]
 * @param {number} [options.visibilityTimeout=5]
 * @returns {Promise<Array<{messageId: string, sentTimestamp: string, approximateReceiveCount: number, body: string}>>}
 */
export async function receiveMessages(
  sqsClient,
  queueUrl,
  { maxMessages = 100, visibilityTimeout = 5 } = {}
) {
  const seen = new Set()
  const messages = []

  while (messages.length < maxMessages) {
    const result = await sqsClient.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
        VisibilityTimeout: visibilityTimeout,
        MessageAttributeNames: ['All'],
        AttributeNames: ['All']
      })
    )

    const received = result.Messages ?? []

    if (received.length === 0) {
      break
    }

    for (const msg of received) {
      if (seen.has(msg.MessageId)) {
        continue
      }

      seen.add(msg.MessageId)

      messages.push({
        messageId: msg.MessageId,
        sentTimestamp: new Date(
          Number(msg.Attributes?.SentTimestamp)
        ).toISOString(),
        approximateReceiveCount: Number(
          msg.Attributes?.ApproximateReceiveCount
        ),
        body: msg.Body
      })

      if (messages.length >= maxMessages) {
        break
      }
    }
  }

  return messages
}
