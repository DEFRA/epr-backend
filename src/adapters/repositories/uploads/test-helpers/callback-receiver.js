import { createServer } from 'node:http'

const HTTP_ACCEPTED = 202

/**
 * Creates a minimal HTTP server that captures POST requests for testing.
 *
 * @returns {Promise<{
 *   url: string,
 *   requests: Array<{ path: string, payload: unknown }>,
 *   clear: () => void,
 *   stop: () => Promise<void>
 * }>}
 */
export const createCallbackReceiver = async () => {
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
    server.listen(0, '127.0.0.1', resolve)
  })

  const { port } = server.address()

  return {
    url: `http://127.0.0.1:${port}`,
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
