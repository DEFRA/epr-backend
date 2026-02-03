import { test as baseTest } from 'vitest'
import { GenericContainer, Wait } from 'testcontainers'
import {
  SQSClient,
  CreateQueueCommand,
  GetQueueAttributesCommand
} from '@aws-sdk/client-sqs'

const LOCALSTACK_IMAGE = 'localstack/localstack:3.0.2'
const LOCALSTACK_PORT = 4566

const REGION = 'eu-west-2'
const CREDENTIALS = {
  accessKeyId: 'test',
  secretAccessKey: 'test'
}

const QUEUE_NAME_PREFIX = 'epr_backend_commands'
const DLQ_NAME_PREFIX = 'epr_backend_commands_dlq'

let testCounter = 0

const localstackFixture = {
  localstack: [
    // eslint-disable-next-line no-empty-pattern -- vitest fixtures require object destructuring
    async ({}, use) => {
      // Disable vitest-fetch-mock so we can make real HTTP requests
      if (globalThis.fetchMock) {
        globalThis.fetchMock.disableMocks()
      }

      const container = await new GenericContainer(LOCALSTACK_IMAGE)
        .withExposedPorts(LOCALSTACK_PORT)
        .withEnvironment({
          SERVICES: 'sqs',
          DEFAULT_REGION: REGION,
          AWS_ACCESS_KEY_ID: CREDENTIALS.accessKeyId,
          AWS_SECRET_ACCESS_KEY: CREDENTIALS.secretAccessKey
        })
        .withStartupTimeout(60000)
        .withWaitStrategy(
          Wait.forLogMessage(/Ready\./).withStartupTimeout(60000)
        )
        .start()

      const port = container.getMappedPort(LOCALSTACK_PORT)
      const endpoint = `http://127.0.0.1:${port}`

      await use({
        container,
        endpoint,
        region: REGION,
        credentials: CREDENTIALS
      })

      await container.stop()

      if (globalThis.fetchMock) {
        globalThis.fetchMock.enableMocks()
      }
    },
    { scope: 'file' }
  ]
}

const sqsClientFixture = {
  sqsClient: async ({ localstack }, use) => {
    const client = new SQSClient({
      region: localstack.region,
      endpoint: localstack.endpoint,
      credentials: localstack.credentials
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
    const dlqArn = dlqAttributes.Attributes.QueueArn

    // Create main queue with redrive policy
    await client.send(
      new CreateQueueCommand({
        QueueName: queueName,
        Attributes: {
          RedrivePolicy: JSON.stringify({
            deadLetterTargetArn: dlqArn,
            maxReceiveCount: '3'
          })
        }
      })
    )

    // Extend client with queue names for easy access in tests
    client.queueName = queueName
    client.dlqName = dlqName

    await use(client)
    client.destroy()
  }
}

/**
 * Extended test with SQS fixtures.
 * Each test gets:
 * - localstack: shared container (file scope)
 * - sqsClient: fresh client with unique queues per test (test scope)
 *
 * Access queue names via sqsClient.queueName and sqsClient.dlqName
 */
export const it = baseTest.extend({
  ...localstackFixture,
  ...sqsClientFixture
})
