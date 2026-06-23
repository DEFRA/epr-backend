import { describe, it, expect, vi } from 'vitest'

import { createMockSqsClient } from './mock-sqs-client.js'

describe('createMockSqsClient', () => {
  it('provides send and destroy as mock functions', () => {
    const client = createMockSqsClient()

    expect(vi.isMockFunction(client.send)).toBe(true)
    expect(vi.isMockFunction(client.destroy)).toBe(true)
  })

  it('returns a fresh set of mocks on each call', () => {
    const first = createMockSqsClient()
    const second = createMockSqsClient()

    expect(first.send).not.toBe(second.send)
  })

  it('exposes queueName and dlqName helpers with defaults', () => {
    const client = createMockSqsClient()

    expect(client.queueName).toBe('test-queue')
    expect(client.dlqName).toBe('test-queue-dlq')
  })

  it('accepts overrides for send and the queue-name helpers', () => {
    const send = vi.fn().mockResolvedValue({ QueueUrl: 'url' })
    const client = createMockSqsClient({
      send,
      queueName: 'custom',
      dlqName: 'custom-dlq'
    })

    expect(client.send).toBe(send)
    expect(client.queueName).toBe('custom')
    expect(client.dlqName).toBe('custom-dlq')
  })
})
