import {
  GetQueueAttributesCommand,
  PurgeQueueCommand
} from '@aws-sdk/client-sqs'
import { resolveQueueUrl } from '#common/helpers/sqs/sqs-client.js'

/** @typedef {import('@aws-sdk/client-sqs').SQSClient} SQSClientType */

/**
 * Resolves the DLQ URL by reading the redrive policy of the main queue.
 * @param {SQSClientType} sqsClient
 * @param {string} mainQueueName
 * @returns {Promise<string>}
 */
export async function getDlqUrl(sqsClient, mainQueueName) {
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
 * Returns the approximate number of messages in the DLQ.
 * @param {SQSClientType} sqsClient
 * @param {string} dlqUrl
 * @returns {Promise<{ approximateMessageCount: number }>}
 */
export async function getDlqStatus(sqsClient, dlqUrl) {
  const { Attributes: attributes } = await sqsClient.send(
    new GetQueueAttributesCommand({
      QueueUrl: dlqUrl,
      AttributeNames: ['ApproximateNumberOfMessages']
    })
  )

  /* c8 ignore next - defensive: SDK always returns the requested attribute */
  const approximateMessageCount = parseInt(
    attributes?.ApproximateNumberOfMessages ?? '0',
    10
  )

  return { approximateMessageCount }
}

/**
 * Purges all messages from the DLQ.
 * @param {SQSClientType} sqsClient
 * @param {string} dlqUrl
 * @returns {Promise<void>}
 */
export async function purgeDlq(sqsClient, dlqUrl) {
  await sqsClient.send(new PurgeQueueCommand({ QueueUrl: dlqUrl }))
}
