import {
  SQSClient,
  GetQueueUrlCommand,
  GetQueueAttributesCommand,
  PurgeQueueCommand
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
