import { readFileSync } from 'node:fs'
import http from 'node:http'
import http2 from 'node:http2'
import net from 'node:net'
import { gzipSync } from 'node:zlib'

import { getGlobalDispatcher, setGlobalDispatcher } from 'undici'

import { config } from '#root/config.js'
import { fetchJson } from '#common/helpers/fetch-json.js'
import { setupProxy } from './setup-proxy.js'

/**
 * Guards the pairing CDP relies on: the npm `undici` ProxyAgent installed by
 * setupProxy() as the global dispatcher, driving Node's *built-in* fetch
 * (which bundles its own, older undici). The two versions can drift apart
 * silently - undici 8.11.0 handed responses back to Node's fetch with no
 * headers, so a gzipped body was never decoded and every outbound call failed
 * with a SyntaxError, taking the service down at startup (OIDC discovery).
 *
 * It only shows over an HTTP/2 upstream, which is what CDP's endpoints speak,
 * so this stands up a local CONNECT proxy (like CDP's squid) and an HTTP/2
 * TLS server serving gzipped JSON, and fetches through the real code path.
 */

const fixture = (name) =>
  readFileSync(new URL(`./test-fixtures/${name}`, import.meta.url))

const body = { issuer: 'https://stub.example', padding: 'x'.repeat(2048) }

const listen = (server) =>
  new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve(server.address().port))
  )

describe('setupProxy with Node fetch over an HTTP/2 upstream', () => {
  let upstream
  let proxy
  let upstreamUrl
  let originalDispatcher

  beforeAll(async () => {
    upstream = http2.createSecureServer(
      {
        key: fixture('localhost.key.pem'),
        cert: fixture('localhost.cert.pem'),
        allowHTTP1: true
      },
      (req, res) => {
        const gzip = /gzip/.test(req.headers['accept-encoding'] ?? '')
        res.writeHead(200, {
          'content-type': 'application/json',
          ...(gzip && { 'content-encoding': 'gzip' })
        })
        const json = JSON.stringify(body)
        res.end(gzip ? gzipSync(json) : json)
      }
    )

    proxy = http.createServer()
    proxy.on('connect', (req, socket, head) => {
      const [host, port] = req.url.split(':')
      const tunnel = net.connect(Number(port), host, () => {
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        tunnel.write(head)
        tunnel.pipe(socket)
        socket.pipe(tunnel)
      })
      tunnel.on('error', () => socket.destroy())
      socket.on('error', () => tunnel.destroy())
    })

    upstreamUrl = `https://localhost:${await listen(upstream)}/.well-known/openid-configuration`
    const proxyPort = await listen(proxy)

    originalDispatcher = getGlobalDispatcher()
    config.set('httpProxy', `http://127.0.0.1:${proxyPort}`)
    setupProxy()
  })

  beforeEach(() => {
    // The upstream uses a self-signed test certificate.
    vi.stubEnv('NODE_TLS_REJECT_UNAUTHORIZED', '0')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  afterAll(async () => {
    config.set('httpProxy', null)
    setGlobalDispatcher(originalDispatcher)
    proxy.close()
    await new Promise((resolve) => upstream.close(resolve))
  })

  test('response headers survive the proxy', async () => {
    const response = await fetch(upstreamUrl)
    await response.arrayBuffer()

    expect(response.headers.get('content-type')).toBe('application/json')
  })

  test('fetchJson returns the decoded JSON body', async () => {
    await expect(fetchJson(upstreamUrl)).resolves.toEqual(body)
  })
})
