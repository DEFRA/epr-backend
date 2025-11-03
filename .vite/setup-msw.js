import { setupServer } from 'msw/node'
import { beforeAll, afterEach, afterAll } from 'vitest'

export { http, HttpResponse, delay } from 'msw'

export const handlers = []

export const server = setupServer(...handlers)

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' })
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})
