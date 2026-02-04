import { SQSClient } from '@aws-sdk/client-sqs'

import { createSqsClient } from './sqs-client.js'

vi.mock('@aws-sdk/client-sqs')

const region = 'eu-west-2'
const endpoint = 'http://localhost:4566'

describe('createSqsClient', () => {
  let sqsClient

  beforeEach(() => {
    sqsClient = { config: { region } }

    vi.mocked(SQSClient).mockImplementation(function () {
      return sqsClient
    })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('should create client with expected configuration', () => {
    createSqsClient({ region, endpoint })

    expect(SQSClient).toHaveBeenCalledWith({
      region,
      endpoint
    })
  })

  it('should return expected SQSClient instance', () => {
    const result = createSqsClient({ region, endpoint })

    expect(result).toBe(sqsClient)
  })

  it('should include credentials when provided', () => {
    const credentials = {
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret'
    }

    createSqsClient({ region, endpoint, credentials })

    expect(SQSClient).toHaveBeenCalledWith({
      region,
      endpoint,
      credentials
    })
  })
})
