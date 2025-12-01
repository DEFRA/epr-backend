import { test as baseTest } from 'vitest'
import { GenericContainer, Wait } from 'testcontainers'

const REDIS_IMAGE = 'redis:7-alpine'
const REDIS_PORT = 6379

const redisFixture = {
  redis: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const container = await new GenericContainer(REDIS_IMAGE)
        .withExposedPorts(REDIS_PORT)
        .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
        .start()

      const port = container.getMappedPort(REDIS_PORT)
      const host = '127.0.0.1'

      await use({
        host,
        port,
        url: `redis://${host}:${port}`
      })

      await container.stop()
    },
    { scope: 'file' }
  ]
}

export const it = baseTest.extend(redisFixture)
