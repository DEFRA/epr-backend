import { SQSClient } from '@aws-sdk/client-sqs'

export function createSqsClient({ region, endpoint, credentials = undefined }) {
  const config = {
    region
  }

  if (endpoint) {
    config.endpoint = endpoint
  }

  if (credentials) {
    config.credentials = credentials
  }

  return new SQSClient(config)
}
