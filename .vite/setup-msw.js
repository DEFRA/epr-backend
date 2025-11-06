import { setupServer } from 'msw/node'
import { beforeAll, afterEach, afterAll } from 'vitest'

import { http, passthrough } from 'msw'
export { http, HttpResponse, delay } from 'msw'

export const handlers = []

// Allow MongoDB binary downloads to bypass MSW interception
const mongoDownloadHandler = http.get('https://fastdl.mongodb.org/*', () => {
  return passthrough()
})

export const server = setupServer(...handlers, mongoDownloadHandler)

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' })
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})
