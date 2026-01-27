import { describe, it, expect } from 'vitest'
import { SQSClient } from '@aws-sdk/client-sqs'
import { createSQSClient } from './sqs-client.js'

describe('createSQSClient', () => {
  it('creates an SQS client with region only', () => {
    const client = createSQSClient({ region: 'eu-west-2' })

    expect(client).toBeInstanceOf(SQSClient)
    client.destroy()
  })

  it('creates an SQS client with custom endpoint', () => {
    const client = createSQSClient({
      region: 'eu-west-2',
      endpoint: 'http://localhost:4566'
    })

    expect(client).toBeInstanceOf(SQSClient)
    client.destroy()
  })

  it('creates an SQS client with null endpoint (uses default AWS)', () => {
    const client = createSQSClient({
      region: 'eu-west-2',
      endpoint: null
    })

    expect(client).toBeInstanceOf(SQSClient)
    client.destroy()
  })
})
