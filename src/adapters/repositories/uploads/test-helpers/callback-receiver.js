import { createServer } from 'node:http'

const HTTP_ACCEPTED = 202
const MAX_POLL_ATTEMPTS = 150
const POLL_INTERVAL_MS = 100

const DEFAULT_HOST = '127.0.0.1'

/**
 * @typedef {Object} CallbackReceiver
 * @property {number} port - Port the server is listening on
 * @property {string} callbackUrl - URL that external systems should use for callbacks
 * @property {Array<{ path: string, payload: unknown }>} requests - Captured requests
 * @property {() => void} clear - Clears captured requests
 * @property {() => Promise<void>} stop - Stops the server
 */

/**
 * Creates a minimal HTTP server that captures POST requests for testing.
 *
 * @param {{ bindAddress?: string, callbackHost?: string }} [options] - Configuration options
 * @returns {Promise<CallbackReceiver>}
 */
export const createCallbackReceiver = async (options = {}) => {
  const { bindAddress = DEFAULT_HOST, callbackHost = DEFAULT_HOST } = options

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
    callbackUrl: `http://${callbackHost}:${port}`,
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
