import { createServer } from 'node:http'

const HTTP_ACCEPTED = 202
const MAX_POLL_ATTEMPTS = 150
const POLL_INTERVAL_MS = 100

/**
 * Creates a minimal HTTP server that captures POST requests for testing.
 *
 * @param {{ bindToAllInterfaces?: boolean }} [options] - Configuration options
 * @returns {Promise<{
 *   port: number,
 *   url: string,
 *   testcontainersUrl: string,
 *   requests: Array<{ path: string, payload: unknown }>,
 *   clear: () => void,
 *   stop: () => Promise<void>
 * }>}
 */
export const createCallbackReceiver = async (options = {}) => {
  const { bindToAllInterfaces = false } = options
  const bindAddress = bindToAllInterfaces ? '0.0.0.0' : '127.0.0.1'

  const requests = []

  const server = createServer((req, res) => {
    let body = ''

    req.on('data', (chunk) => {
      body += chunk.toString()
    })

    req.on('end', () => {
      requests.push({
        path: req.url,
        payload: JSON.parse(body)
      })

      res.writeHead(HTTP_ACCEPTED)
      res.end()
    })
  })

  await new Promise((resolve) => {
    server.listen(0, bindAddress, resolve)
  })

  const { port } = server.address()

  return {
    port,
    url: `http://127.0.0.1:${port}`,
    testcontainersUrl: `http://host.testcontainers.internal:${port}`,
    requests,
    clear: () => {
      requests.length = 0
    },
    stop: () =>
      new Promise((resolve) => {
        server.close(resolve)
      })
  }
}

/**
 * Polls callback receiver until a callback arrives or timeout occurs.
 *
 * @param {{ requests: Array<{ path: string, payload: unknown }> }} callbackReceiver
 * @returns {Promise<{ path: string, payload: unknown }>}
 * @throws {Error} If no callback received after MAX_POLL_ATTEMPTS
 */
export const waitForCallback = async (callbackReceiver) => {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    if (callbackReceiver.requests.length > 0) {
      return callbackReceiver.requests[0]
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  throw new Error(
    `No callback received within ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS}ms`
  )
}
