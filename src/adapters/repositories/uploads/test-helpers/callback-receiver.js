import { createServer } from 'node:http'

const HTTP_ACCEPTED = 202
const MAX_POLL_ATTEMPTS = 150
const POLL_INTERVAL_MS = 100

/**
 * @typedef {Object} CallbackReceiver
 * @property {number} port - Port the server is listening on
 * @property {string} url - URL for localhost access (http://127.0.0.1:port)
 * @property {string} testcontainersUrl - URL for testcontainers access (http://host.testcontainers.internal:port)
 * @property {Array<{ path: string, payload: unknown }>} requests - Captured requests
 * @property {() => void} clear - Clears captured requests
 * @property {() => Promise<void>} stop - Stops the server
 */

/**
 * Creates a minimal HTTP server that captures POST requests for testing.
 *
 * @param {{ bindToAllInterfaces?: boolean }} [options] - Configuration options
 * @returns {Promise<CallbackReceiver>}
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
 * @param {CallbackReceiver} callbackReceiver
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
