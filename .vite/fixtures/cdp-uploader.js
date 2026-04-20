import { createUploadsRepository } from '#adapters/repositories/uploads/cdp-uploader.js'
import { createCallbackReceiver } from '#adapters/repositories/uploads/test-helpers/callback-receiver.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  GenericContainer,
  Network,
  SocatContainer,
  TestContainers,
  Wait
} from 'testcontainers'
import { test as baseTest } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FLOCI_INIT_DIR = path.resolve(__dirname, 'cdp-uploader/floci')

const FLOCI_IMAGE = 'hectorvent/floci:1.5.3'
const AWS_CLI_IMAGE = 'amazon/aws-cli:2.17.43'
const REDIS_IMAGE = 'redis:7.2.11-alpine3.21'
const CDP_UPLOADER_IMAGE = 'defradigital/cdp-uploader:1.15.0'

const FLOCI_PORT = 4566
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
        bindAddress: '0.0.0.0',
        callbackHost: 'host.testcontainers.internal'
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
    async ({ callbackReceiver: _ }, use) => {
      const network = await new Network().start()

      const [flociContainer, redisContainer] = await Promise.all([
        new GenericContainer(FLOCI_IMAGE)
          .withExposedPorts(FLOCI_PORT)
          .withEnvironment({
            FLOCI_HOSTNAME: 'floci',
            FLOCI_DEFAULT_REGION: REGION,
            AWS_ACCESS_KEY_ID: CREDENTIALS.accessKeyId,
            AWS_SECRET_ACCESS_KEY: CREDENTIALS.secretAccessKey
          })
          .withNetwork(network)
          .withNetworkAliases('floci')
          .withStartupTimeout(90000)
          .start(),

        new GenericContainer(REDIS_IMAGE)
          .withExposedPorts(REDIS_PORT)
          .withStartupTimeout(30000)
          .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
          .withNetwork(network)
          .withNetworkAliases('redis')
          .start()
      ])

      // Separate one-shot init container seeds buckets/queues and exits.
      // Matches the compose pattern used by epr-re-ex-service and the
      // journey-test stacks. Floci itself has no wait strategy: readiness
      // is gated by this init container, which self-polls Floci via
      // `aws sqs list-queues` in init.sh before it seeds anything.
      const flociInitContainer = await new GenericContainer(AWS_CLI_IMAGE)
        .withEntrypoint(['/bin/sh'])
        .withCommand(['/setup/init.sh'])
        .withCopyDirectoriesToContainer([
          { source: FLOCI_INIT_DIR, target: '/setup', mode: 0o555 }
        ])
        .withEnvironment({
          AWS_ENDPOINT_URL: 'http://floci:4566',
          AWS_REGION: REGION,
          AWS_DEFAULT_REGION: REGION,
          AWS_ACCESS_KEY_ID: CREDENTIALS.accessKeyId,
          AWS_SECRET_ACCESS_KEY: CREDENTIALS.secretAccessKey
        })
        .withNetwork(network)
        .withWaitStrategy(
          Wait.forLogMessage(/\[floci-init\] Done/).withStartupTimeout(120000)
        )
        .start()
      await flociInitContainer.stop()

      // NOTE: CDP Uploader is AMD64-only. On ARM Macs, port forwarding is broken
      // due to Rosetta emulation issues with testcontainers. We use SocatContainer
      // as a proxy to work around this. On x86, SocatContainer is unnecessary but
      // harmless, and keeping the setup consistent across architectures is simpler.
      const cdpUploaderContainer = await new GenericContainer(
        CDP_UPLOADER_IMAGE
      )
        .withStartupTimeout(120000)
        .withEnvironment({
          AWS_REGION: REGION,
          AWS_DEFAULT_REGION: REGION,
          AWS_ACCESS_KEY_ID: CREDENTIALS.accessKeyId,
          AWS_SECRET_ACCESS_KEY: CREDENTIALS.secretAccessKey,
          CONSUMER_BUCKETS: 're-ex-summary-logs,re-ex-overseas-sites',
          MOCK_VIRUS_RESULT_DELAY: '1',
          MOCK_VIRUS_SCAN_ENABLED: 'true',
          NODE_ENV: 'development',
          PORT: String(CDP_UPLOADER_PORT),
          REDIS_HOST: 'redis',
          S3_ENDPOINT: 'http://floci:4566',
          SQS_ENDPOINT: 'http://floci:4566',
          // Floci requires path-form queue URLs (/<account>/<name>) for ReceiveMessage;
          // cdp-uploader defaults to bare queue names that Floci rejects.
          SQS_SCAN_RESULTS: 'http://floci:4566/000000000000/cdp-clamav-results',
          SQS_SCAN_RESULTS_CALLBACK:
            'http://floci:4566/000000000000/cdp-uploader-scan-results-callback.fifo',
          SQS_DOWNLOAD_REQUESTS:
            'http://floci:4566/000000000000/cdp-uploader-download-requests',
          SQS_MOCK_CLAMAV: 'http://floci:4566/000000000000/mock-clamav',
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

      const flociPort = flociContainer.getMappedPort(FLOCI_PORT)
      const flociEndpoint = `http://127.0.0.1:${flociPort}`

      const redisPort = redisContainer.getMappedPort(REDIS_PORT)
      const redisHost = '127.0.0.1'

      // Use SocatContainer as a TCP proxy to CDP Uploader (see ARM note above)
      const socatContainer = await new SocatContainer()
        .withStartupTimeout(30000)
        .withNetwork(network)
        .withTarget(CDP_UPLOADER_PORT, 'cdp-uploader', CDP_UPLOADER_PORT)
        .withWaitStrategy(
          Wait.forHttp('/health', CDP_UPLOADER_PORT).withStartupTimeout(30000)
        )
        .start()

      const cdpUploaderPort = socatContainer.getMappedPort(CDP_UPLOADER_PORT)
      const cdpUploaderUrl = `http://${socatContainer.getHost()}:${cdpUploaderPort}`

      await use({
        network,
        floci: {
          endpoint: flociEndpoint,
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
      await Promise.all([flociContainer.stop(), redisContainer.stop()])
      await network.stop()
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
      region: cdpUploaderStack.floci.region,
      endpoint: cdpUploaderStack.floci.endpoint,
      forcePathStyle: true,
      credentials: cdpUploaderStack.floci.credentials
    })

    await use(client)
    client.destroy()
  },

  uploadsRepository: async ({ s3Client, cdpUploaderStack }, use) => {
    const repository = createUploadsRepository({
      s3Client,
      cdpUploaderUrl: cdpUploaderStack.cdpUploader.url,
      summaryLogsBucket: 're-ex-summary-logs',
      orsBucket: 're-ex-overseas-sites'
    })

    await use(repository)
  }
}

export const it = baseTest.extend(extendedFixtures)
