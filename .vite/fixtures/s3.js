import { test as baseTest } from 'vitest'
import { GenericContainer, Wait } from 'testcontainers'

const s3Fixture = {
  s3: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const s3Container = await new GenericContainer(
        'minio/minio:RELEASE.2025-09-07T16-13-09Z'
      )
        .withExposedPorts(9000)
        .withEnvironment({
          MINIO_ROOT_USER: 'minioadmin',
          MINIO_ROOT_PASSWORD: 'minioadmin'
        })
        .withCommand(['server', '/data'])
        .withWaitStrategy(Wait.forLogMessage(/.*API.*/))
        .start()

      const s3Port = s3Container.getMappedPort(9000)
      const s3Endpoint = `http://127.0.0.1:${s3Port}`

      globalThis.__S3_ENDPOINT__ = s3Endpoint
      globalThis.__S3_ACCESS_KEY__ = 'minioadmin'
      globalThis.__S3_SECRET_KEY__ = 'minioadmin'

      await use(s3Endpoint)

      await s3Container.stop()
    },
    { scope: 'file' }
  ]
}

export const it = baseTest.extend(s3Fixture)
