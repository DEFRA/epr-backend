import {
  SQSClient,
  GetQueueUrlCommand,
  GetQueueAttributesCommand,
  PurgeQueueCommand,
  ReceiveMessageCommand
} from '@aws-sdk/client-sqs'

/** @typedef {import('@aws-sdk/client-sqs').SQSClient} SQSClientType */

/**
 * Creates a configured AWS SQS client.
 * @param {Object} options
 * @param {string} options.region - AWS region
 * @param {string} [options.endpoint] - Custom SQS endpoint (e.g. LocalStack)
 * @param {object} [options.credentials] - AWS credentials override
 * @returns {import('@aws-sdk/client-sqs').SQSClient}
 */
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
 * Peeks at messages in a queue without consuming them.
 *
 * SQS has no native peek or list-messages operation. The only way to inspect
 * queue contents is ReceiveMessage, which temporarily hides messages from
 * other consumers. This function works around that by using a short
 * VisibilityTimeout (2s) so messages reappear quickly. The timeout must be
 * non-zero: at zero, the same batch is re-delivered on the next poll,
 * blocking access to messages on other SQS server partitions.
 *
 * Because SQS distributes messages across servers, repeated polling may
 * return the same messages once the visibility timeout expires. Results are
 * deduplicated by MessageId and the loop exits when a batch yields nothing
 * new. This means results are a best-effort sample, not an exhaustive list.
 *
 * @param {SQSClientType} sqsClient
 * @param {string} queueUrl
 * @param {Object} [options]
 * @param {number} [options.maxMessages=100]
 * @returns {Promise<Array<{messageId: string, sentTimestamp: string|null, approximateReceiveCount: number, body: string}>>}
 */
export async function receiveMessages(
  sqsClient,
  queueUrl,
  { maxMessages = 100 } = {}
) {
  const seen = new Set()
  const messages = []

  while (messages.length < maxMessages) {
    const result = await sqsClient.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: Math.min(maxMessages - messages.length, 10),
        VisibilityTimeout: 2,
        WaitTimeSeconds: 0,
        AttributeNames: ['All']
      })
    )

    const received = result.Messages ?? []
    if (received.length === 0) break

    let added = 0
    for (const msg of received) {
      if (!msg.MessageId || msg.Body === undefined) continue
      if (seen.has(msg.MessageId)) continue
      seen.add(msg.MessageId)

      const timestamp = Number(msg.Attributes?.SentTimestamp)

      messages.push({
        messageId: msg.MessageId,
        sentTimestamp: Number.isFinite(timestamp)
          ? new Date(timestamp).toISOString()
          : null,
        approximateReceiveCount:
          Number(msg.Attributes?.ApproximateReceiveCount) || 0,
        body: msg.Body
      })

      added++
      if (messages.length >= maxMessages) break
    }

    if (added === 0) break
  }

  return messages
}
