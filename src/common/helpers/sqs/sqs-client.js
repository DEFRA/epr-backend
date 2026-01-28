import { SQSClient } from '@aws-sdk/client-sqs'

export function createSQSClient({ region, endpoint = null }) {
  const config = { region }

  if (endpoint) {
    config.endpoint = endpoint
  }

  return new SQSClient(config)
}
