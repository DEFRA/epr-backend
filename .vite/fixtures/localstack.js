import { test as baseTest } from 'vitest'
import { GenericContainer, Wait } from 'testcontainers'
import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3'

const LOCALSTACK_IMAGE = 'localstack/localstack:3.0.2'
const LOCALSTACK_PORT = 4566
const REGION = 'eu-west-2'
const CREDENTIALS = {
  accessKeyId: 'test',
  secretAccessKey: 'test'
}

const BUCKETS = ['cdp-uploader-quarantine', 're-ex-summary-logs']

async function createBuckets(s3Client) {
  for (const bucket of BUCKETS) {
    await s3Client.send(new CreateBucketCommand({ Bucket: bucket }))
  }
}

const localstackFixture = {
  localstack: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const container = await new GenericContainer(LOCALSTACK_IMAGE)
        .withExposedPorts(LOCALSTACK_PORT)
        .withEnvironment({
          SERVICES: 's3',
          DEFAULT_REGION: REGION,
          AWS_ACCESS_KEY_ID: CREDENTIALS.accessKeyId,
          AWS_SECRET_ACCESS_KEY: CREDENTIALS.secretAccessKey
        })
        .withWaitStrategy(
          Wait.forHttp(
            '/_localstack/health',
            LOCALSTACK_PORT
          ).withStartupTimeout(60000)
        )
        .start()

      const port = container.getMappedPort(LOCALSTACK_PORT)
      const endpoint = `http://127.0.0.1:${port}`

      const s3Client = new S3Client({
        region: REGION,
        endpoint,
        forcePathStyle: true,
        credentials: CREDENTIALS
      })

      await createBuckets(s3Client)
      s3Client.destroy()

      await use({
        endpoint,
        region: REGION,
        credentials: CREDENTIALS
      })

      await container.stop()
    },
    { scope: 'file' }
  ]
}

export const it = baseTest.extend(localstackFixture)
