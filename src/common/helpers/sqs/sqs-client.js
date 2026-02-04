import { SQSClient } from '@aws-sdk/client-sqs'

export function createSqsClient({ region, endpoint, credentials = undefined }) {
  const config = {
    region,
    endpoint
  }

  if (credentials) {
    config.credentials = credentials
  }

  return new SQSClient(config)
}
