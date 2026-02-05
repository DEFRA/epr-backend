import { SQSClient, GetQueueUrlCommand } from '@aws-sdk/client-sqs'

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
