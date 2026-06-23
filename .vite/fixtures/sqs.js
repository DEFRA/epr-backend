import { test as baseTest } from 'vitest'
import { GenericContainer } from 'testcontainers'
import {
  SQSClient,
  CreateQueueCommand,
  GetQueueAttributesCommand
} from '@aws-sdk/client-sqs'

const FLOCI_IMAGE = 'hectorvent/floci:1.5.3'
const FLOCI_PORT = 4566

const REGION = 'eu-west-2'
const CREDENTIALS = {
  accessKeyId: 'test',
  secretAccessKey: 'test'
}

const QUEUE_NAME_PREFIX = 'epr_backend_commands'
const DLQ_NAME_PREFIX = 'epr_backend_commands_dlq'

/**
 * A real SQSClient augmented with the queue names this fixture provisions, so
 * tests can resolve queue URLs without re-deriving the names.
 *
 * @typedef {SQSClient & { queueName: string, dlqName: string }} FixtureSqsClient
 */

let testCounter = 0

/**
 * @typedef {object} Floci
 * @property {import('testcontainers').StartedTestContainer} container
 * @property {string} endpoint
 * @property {string} region
 * @property {{ accessKeyId: string, secretAccessKey: string }} credentials
 */

/**
 * The SQS client a test receives, carrying the unique queue names provisioned
 * for that test so handlers can address them by name.
 *
 * @typedef {SQSClient & { queueName: string, dlqName: string }} TestSqsClient
 */

const flociFixture = {
  floci: [
    /**
     * @param {Record<string, never>} _deps
     * @param {(value: Floci) => Promise<void>} use
     */
    // eslint-disable-next-line no-empty-pattern -- vitest fixtures require object destructuring
    async ({}, use) => {
      const container = await new GenericContainer(FLOCI_IMAGE)
        .withExposedPorts(FLOCI_PORT)
        .withEnvironment({
          FLOCI_DEFAULT_REGION: REGION,
          AWS_ACCESS_KEY_ID: CREDENTIALS.accessKeyId,
          AWS_SECRET_ACCESS_KEY: CREDENTIALS.secretAccessKey
        })
        .withStartupTimeout(90000)
        .start()

      const port = container.getMappedPort(FLOCI_PORT)
      const endpoint = `http://127.0.0.1:${port}`

      await use({
        container,
        endpoint,
        region: REGION,
        credentials: CREDENTIALS
      })

      await container.stop()
    },
    { scope: 'file' }
  ]
}

const sqsClientFixture = {
  /**
   * @param {{ floci: Floci }} deps
   * @param {(value: TestSqsClient) => Promise<void>} use
   */
  sqsClient: async ({ floci }, use) => {
    const client = new SQSClient({
      region: floci.region,
      endpoint: floci.endpoint,
      credentials: floci.credentials
    })

    // Create unique queue names for this test to ensure isolation
    const testId = testCounter++
    const queueName = `${QUEUE_NAME_PREFIX}_${testId}`
    const dlqName = `${DLQ_NAME_PREFIX}_${testId}`

    // Create DLQ first
    const dlqResult = await client.send(
      new CreateQueueCommand({ QueueName: dlqName })
    )

    // Get DLQ ARN for redrive policy
    const dlqAttributes = await client.send(
      new GetQueueAttributesCommand({
        QueueUrl: dlqResult.QueueUrl,
        AttributeNames: ['QueueArn']
      })
    )
    const dlqArn = dlqAttributes.Attributes?.QueueArn

    // Create main queue with redrive policy
    await client.send(
      new CreateQueueCommand({
        QueueName: queueName,
        Attributes: {
          VisibilityTimeout: '1',
          RedrivePolicy: JSON.stringify({
            deadLetterTargetArn: dlqArn,
            maxReceiveCount: '2'
          })
        }
      })
    )

    // Extend client with queue names for easy access in tests
    const fixtureClient = /** @type {FixtureSqsClient} */ (client)
    fixtureClient.queueName = queueName
    fixtureClient.dlqName = dlqName

    await use(fixtureClient)
    fixtureClient.destroy()
  }
}

/**
 * Extended test with SQS fixtures.
 * Each test gets:
 * - floci: shared container (file scope)
 * - sqsClient: fresh client with unique queues per test (test scope)
 *
 * Access queue names via sqsClient.queueName and sqsClient.dlqName
 *
 * @type {import('vitest').TestAPI<{ floci: Floci, sqsClient: TestSqsClient }>}
 */
export const it = baseTest.extend({
  ...flociFixture,
  ...sqsClientFixture
})
