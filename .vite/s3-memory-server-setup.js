import { afterAll, beforeAll } from 'vitest'
import { startS3Server, stopS3Server } from './s3-memory-server.js'

beforeAll(async () => {
  // Setup S3 mock server
  await startS3Server()
  process.env.S3_ENDPOINT = globalThis.__S3_ENDPOINT__
})

afterAll(async () => {
  await stopS3Server()
})
