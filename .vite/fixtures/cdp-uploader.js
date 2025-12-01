import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test as baseTest } from 'vitest'
import {
  GenericContainer,
  Network,
  Wait,
  SocatContainer,
  TestContainers
} from 'testcontainers'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { createUploadsRepository } from '#adapters/repositories/uploads/cdp-uploader.js'
import { createCallbackReceiver } from '#adapters/repositories/uploads/test-helpers/callback-receiver.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const COMPOSE_DIR = path.resolve(__dirname, '../../compose')

const LOCALSTACK_IMAGE = 'localstack/localstack:3.0.2'
const REDIS_IMAGE = 'redis:7.2.11-alpine3.21'
const CDP_UPLOADER_IMAGE = 'defradigital/cdp-uploader:latest'

const LOCALSTACK_PORT = 4566
const REDIS_PORT = 6379
const CDP_UPLOADER_PORT = 7337

const REGION = 'eu-west-2'
const CREDENTIALS = {
  accessKeyId: 'test',
  secretAccessKey: 'test'
}

// Configuration flag for whether tests need the callback receiver
// Use it.scoped({ needsCallbackReceiver: true }) in describe blocks that need it
const configFixtures = {
  needsCallbackReceiver: false
}

// Callback receiver fixture - only creates if needsCallbackReceiver is true
// Must be file-scoped and run BEFORE cdpUploaderStack to ensure exposeHostPorts
// is called before containers start
const callbackReceiverFixture = {
  callbackReceiver: [
    async ({ needsCallbackReceiver }, use) => {
      if (!needsCallbackReceiver) {
        await use(null)
        return
      }

      const receiver = await createCallbackReceiver({
        bindToAllInterfaces: true
      })
      await TestContainers.exposeHostPorts(receiver.port)
      await use(receiver)
      await receiver.stop()
    },
    { scope: 'file' }
  ]
}

const cdpUploaderStackFixture = {
  // Depends on callbackReceiver to ensure correct initialisation order
  cdpUploaderStack: [
    async ({ callbackReceiver }, use) => {
      // Disable vitest-fetch-mock so we can make real HTTP requests to containers
      // The global fetch is mocked by default in .vite/setup-files.js
      if (globalThis.fetchMock) {
        globalThis.fetchMock.disableMocks()
      }

      // Create shared network for containers to communicate
      const network = await new Network().start()

      // Start LocalStack and Redis in parallel
      // LocalStack uses copied init script to create buckets and queues
      const [localstackContainer, redisContainer] = await Promise.all([
        new GenericContainer(LOCALSTACK_IMAGE)
          .withExposedPorts(LOCALSTACK_PORT)
          .withEnvironment({
            SERVICES: 's3,sqs',
            DEFAULT_REGION: REGION,
            AWS_ACCESS_KEY_ID: CREDENTIALS.accessKeyId,
            AWS_SECRET_ACCESS_KEY: CREDENTIALS.secretAccessKey
          })
          .withCopyFilesToContainer([
            {
              source: path.join(COMPOSE_DIR, '01-start-localstack.sh'),
              target: '/etc/localstack/init/ready.d/01-start-localstack.sh',
              mode: 0o755
            }
          ])
          .withWaitStrategy(
            Wait.forLogMessage(/Creating queues/).withStartupTimeout(90000)
          )
          .withNetwork(network)
          .withNetworkAliases('localstack')
          .start(),

        new GenericContainer(REDIS_IMAGE)
          .withExposedPorts(REDIS_PORT)
          .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
          .withNetwork(network)
          .withNetworkAliases('redis')
          .start()
      ])

      const localstackPort = localstackContainer.getMappedPort(LOCALSTACK_PORT)
      const localstackEndpoint = `http://127.0.0.1:${localstackPort}`

      const redisPort = redisContainer.getMappedPort(REDIS_PORT)
      const redisHost = '127.0.0.1'

      // Start CDP Uploader (depends on LocalStack and Redis being ready)
      // NOTE: CDP Uploader is AMD64-only. On ARM Macs, port forwarding is broken
      // due to Rosetta emulation issues with testcontainers. We use SocatContainer
      // as a proxy to work around this. On x86, SocatContainer is unnecessary but
      // harmless, and keeping the setup consistent across architectures is simpler.
      const cdpUploaderContainer = await new GenericContainer(
        CDP_UPLOADER_IMAGE
      )
        // Don't expose ports - we'll use SocatContainer as a proxy
        .withEnvironment({
          AWS_REGION: REGION,
          AWS_DEFAULT_REGION: REGION,
          AWS_ACCESS_KEY_ID: CREDENTIALS.accessKeyId,
          AWS_SECRET_ACCESS_KEY: CREDENTIALS.secretAccessKey,
          CONSUMER_BUCKETS: 're-ex-summary-logs',
          MOCK_VIRUS_RESULT_DELAY: '1',
          MOCK_VIRUS_SCAN_ENABLED: 'true',
          NODE_ENV: 'development',
          PORT: String(CDP_UPLOADER_PORT),
          REDIS_HOST: 'redis',
          S3_ENDPOINT: 'http://localstack:4566',
          SQS_ENDPOINT: 'http://localstack:4566',
          USE_SINGLE_INSTANCE_CACHE: 'true'
        })
        // Enable host.docker.internal on Linux (already available on Docker Desktop)
        .withExtraHosts([
          { host: 'host.docker.internal', ipAddress: 'host-gateway' }
        ])
        .withWaitStrategy(
          Wait.forLogMessage(/Server started successfully/).withStartupTimeout(
            120000
          )
        )
        .withNetwork(network)
        .withNetworkAliases('cdp-uploader')
        .start()

      // Use SocatContainer as a TCP proxy to CDP Uploader (see ARM note above)
      const socatContainer = await new SocatContainer()
        .withNetwork(network)
        .withTarget(CDP_UPLOADER_PORT, 'cdp-uploader', CDP_UPLOADER_PORT)
        .start()

      const cdpUploaderPort = socatContainer.getMappedPort(CDP_UPLOADER_PORT)
      const cdpUploaderUrl = `http://${socatContainer.getHost()}:${cdpUploaderPort}`

      // Give CDP Uploader a moment to fully initialise
      await new Promise((resolve) => setTimeout(resolve, 2000))

      await use({
        network,
        localstack: {
          endpoint: localstackEndpoint,
          region: REGION,
          credentials: CREDENTIALS
        },
        redis: {
          host: redisHost,
          port: redisPort,
          url: `redis://${redisHost}:${redisPort}`
        },
        cdpUploader: {
          url: cdpUploaderUrl
        }
      })

      // Cleanup in reverse order
      await socatContainer.stop()
      await cdpUploaderContainer.stop()
      await Promise.all([localstackContainer.stop(), redisContainer.stop()])
      await network.stop()

      // Re-enable fetch mock for other tests
      if (globalThis.fetchMock) {
        globalThis.fetchMock.enableMocks()
      }
    },
    { scope: 'file' }
  ]
}

// Extended fixture with commonly needed test utilities
const extendedFixtures = {
  ...configFixtures,
  ...callbackReceiverFixture,
  ...cdpUploaderStackFixture,

  s3Client: async ({ cdpUploaderStack }, use) => {
    const client = createS3Client({
      region: cdpUploaderStack.localstack.region,
      endpoint: cdpUploaderStack.localstack.endpoint,
      forcePathStyle: true,
      credentials: cdpUploaderStack.localstack.credentials
    })

    await use(client)
    client.destroy()
  },

  uploadsRepository: async ({ s3Client, cdpUploaderStack }, use) => {
    const repository = createUploadsRepository({
      s3Client,
      cdpUploaderUrl: cdpUploaderStack.cdpUploader.url,
      frontendUrl: 'https://frontend.test',
      backendUrl: 'https://backend.test',
      s3Bucket: 're-ex-summary-logs'
    })

    await use(repository)
  }
}

export const it = baseTest.extend(extendedFixtures)
