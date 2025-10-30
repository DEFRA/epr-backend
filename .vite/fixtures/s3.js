import { test as baseTest } from 'vitest'
import { startS3Server, stopS3Server } from '../s3-memory-server.js'

const s3Fixture = {
  // eslint-disable-next-line no-empty-pattern
  s3: async ({}, use) => {
    await startS3Server()

    const s3Endpoint = globalThis.__S3_ENDPOINT__
    process.env.S3_ENDPOINT = s3Endpoint

    await use(s3Endpoint)

    await stopS3Server()
  }
}

export const it = baseTest.extend(s3Fixture, { scope: 'file' })
