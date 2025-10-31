import { GenericContainer, Wait } from 'testcontainers'

let s3Container

export async function startS3Server() {
  if (s3Container) {
    return
  }

  s3Container = await new GenericContainer(
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
}

export async function stopS3Server() {
  if (s3Container) {
    await s3Container.stop()
    s3Container = null
  }
}
