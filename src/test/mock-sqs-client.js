import { vi } from 'vitest'

/** @import {SQSClient} from '@aws-sdk/client-sqs' */
/** @import {Mock} from 'vitest' */

/**
 * An SQSClient mock as used by the tests: the AWS SDK v3 client surface the
 * production code touches (`send`, `destroy`) plus the `queueName`/`dlqName`
 * helpers the SQS fixture attaches for queue lookups.
 *
 * @typedef {SQSClient & {
 *   send: Mock,
 *   destroy: Mock,
 *   queueName: string,
 *   dlqName: string
 * }} MockSqsClient
 */

/**
 * Builds a typed SQSClient mock with `send` and `destroy` as vi.fn()s, plus the
 * `queueName`/`dlqName` helpers tests rely on. Use this instead of hand-rolling
 * partial `{ send, destroy }` mocks so the AWS SDK v3 client surface only needs
 * satisfying in one place. Accepts overrides for any field.
 *
 * @param {Partial<MockSqsClient>} [overrides]
 * @returns {MockSqsClient}
 */
export const createMockSqsClient = (overrides = {}) => {
  const mock = {
    send: vi.fn(),
    destroy: vi.fn(),
    queueName: 'test-queue',
    dlqName: 'test-queue-dlq',
    ...overrides
  }

  return /** @type {MockSqsClient} */ (/** @type {unknown} */ (mock))
}
