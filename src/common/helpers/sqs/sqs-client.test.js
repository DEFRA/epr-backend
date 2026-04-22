import { SQSClient, ReceiveMessageCommand } from '@aws-sdk/client-sqs'

import { createSqsClient, receiveMessages } from './sqs-client.js'

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

describe('receiveMessages', () => {
  const queueUrl = 'http://localhost:4566/000000000000/test-dlq'
  let mockClient

  function createSqsMessage(id, body, sentTimestamp, receiveCount) {
    return {
      MessageId: id,
      Body: body,
      Attributes: {
        SentTimestamp: String(sentTimestamp),
        ApproximateReceiveCount: String(receiveCount)
      }
    }
  }

  beforeEach(() => {
    mockClient = { send: vi.fn() }
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns an empty array when the queue is empty', async () => {
    mockClient.send.mockResolvedValueOnce({ Messages: [] })

    const result = await receiveMessages(mockClient, queueUrl)

    expect(result).toEqual([])
  })

  it('returns messages with correct shape', async () => {
    const timestamp = new Date('2026-04-21T10:30:00.000Z').getTime()
    const msg = createSqsMessage('msg-1', '{"type":"test"}', timestamp, 3)

    mockClient.send
      .mockResolvedValueOnce({ Messages: [msg] })
      .mockResolvedValueOnce({ Messages: [] })

    const result = await receiveMessages(mockClient, queueUrl)

    expect(result).toEqual([
      {
        messageId: 'msg-1',
        sentTimestamp: '2026-04-21T10:30:00.000Z',
        approximateReceiveCount: 3,
        body: '{"type":"test"}'
      }
    ])
  })

  it('stops when maxMessages cap is reached', async () => {
    const timestamp = Date.now()
    const batch = Array.from({ length: 10 }, (_, i) =>
      createSqsMessage(`msg-${i}`, `body-${i}`, timestamp, 1)
    )

    mockClient.send.mockResolvedValueOnce({ Messages: batch })

    const result = await receiveMessages(mockClient, queueUrl, {
      maxMessages: 5
    })

    expect(result).toHaveLength(5)
  })

  it('handles undefined Messages in response', async () => {
    mockClient.send.mockResolvedValueOnce({})

    const result = await receiveMessages(mockClient, queueUrl)

    expect(result).toEqual([])
  })

  it('skips messages with missing MessageId', async () => {
    const timestamp = Date.now()
    const valid = createSqsMessage('valid-1', 'body', timestamp, 1)
    const noId = { Body: 'body', Attributes: {} }

    mockClient.send
      .mockResolvedValueOnce({ Messages: [noId, valid] })
      .mockResolvedValueOnce({ Messages: [] })

    const result = await receiveMessages(mockClient, queueUrl)

    expect(result).toHaveLength(1)
    expect(result[0].messageId).toBe('valid-1')
  })

  it('skips messages with undefined Body', async () => {
    const timestamp = Date.now()
    const valid = createSqsMessage('valid-1', 'body', timestamp, 1)
    const noBody = { MessageId: 'no-body', Attributes: {} }

    mockClient.send
      .mockResolvedValueOnce({ Messages: [noBody, valid] })
      .mockResolvedValueOnce({ Messages: [] })

    const result = await receiveMessages(mockClient, queueUrl)

    expect(result).toHaveLength(1)
    expect(result[0].messageId).toBe('valid-1')
  })

  it('returns null sentTimestamp when SentTimestamp is missing', async () => {
    const msg = {
      MessageId: 'msg-1',
      Body: 'body',
      Attributes: { ApproximateReceiveCount: '2' }
    }

    mockClient.send
      .mockResolvedValueOnce({ Messages: [msg] })
      .mockResolvedValueOnce({ Messages: [] })

    const result = await receiveMessages(mockClient, queueUrl)

    expect(result[0].sentTimestamp).toBeNull()
  })

  it('defaults approximateReceiveCount to 0 when missing', async () => {
    const msg = {
      MessageId: 'msg-1',
      Body: 'body',
      Attributes: { SentTimestamp: String(Date.now()) }
    }

    mockClient.send
      .mockResolvedValueOnce({ Messages: [msg] })
      .mockResolvedValueOnce({ Messages: [] })

    const result = await receiveMessages(mockClient, queueUrl)

    expect(result[0].approximateReceiveCount).toBe(0)
  })

  it('uses short polling and zero visibility timeout', async () => {
    mockClient.send.mockResolvedValueOnce({ Messages: [] })

    await receiveMessages(mockClient, queueUrl)

    expect(ReceiveMessageCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        VisibilityTimeout: 0,
        WaitTimeSeconds: 0,
        AttributeNames: ['All']
      })
    )
  })
})
