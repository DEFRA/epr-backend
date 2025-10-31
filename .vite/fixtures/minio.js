import { GenericContainer, Wait } from 'testcontainers'

let minioContainer

export async function startMinioServer() {
  if (minioContainer) {
    return
  }

  minioContainer = await new GenericContainer('minio/minio:latest')
    .withExposedPorts(9000)
    .withEnvironment({
      MINIO_ROOT_USER: 'minioadmin',
      MINIO_ROOT_PASSWORD: 'minioadmin'
    })
    .withCommand(['server', '/data'])
    .withWaitStrategy(Wait.forLogMessage(/.*API.*/))
    .start()

  const minioPort = minioContainer.getMappedPort(9000)
  const minioEndpoint = `http://127.0.0.1:${minioPort}`

  globalThis.__MINIO_ENDPOINT__ = minioEndpoint
  globalThis.__MINIO_ACCESS_KEY__ = 'minioadmin'
  globalThis.__MINIO_SECRET_KEY__ = 'minioadmin'
}

export async function stopMinioServer() {
  if (minioContainer) {
    await minioContainer.stop()
    minioContainer = null
  }
}
