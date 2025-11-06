import { setupServer } from 'msw/node'
import { beforeAll, afterEach, afterAll } from 'vitest'

import { http } from 'msw'
export { http, HttpResponse, delay } from 'msw'

export const handlers = []
const mongoDownloadPassthrough = http.get(
  'https://fastdl.mongodb.org/*',
  (req, res, ctx) => {
    return req.passthrough()
  }
)

export const server = setupServer(...handlers, mongoDownloadPassthrough)

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' })
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})
