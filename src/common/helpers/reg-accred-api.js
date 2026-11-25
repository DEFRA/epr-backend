import { createHmac, randomBytes } from 'node:crypto'

/**
 * @typedef {{
 *   baseUrl: string
 *   clientId: string
 *   sharedSecret: string
 * }} RegAccredApiConfig
 */

/**
 * The CDP v3 HMAC headers Reg Accred authenticates callers with.
 *
 * @param {Pick<RegAccredApiConfig, 'clientId' | 'sharedSecret'>} config
 * @param {{ now?: () => Date, newNonce?: () => string }} [sources]
 * @returns {Record<string, string>}
 */
export const signedHeaders = (
  { clientId, sharedSecret },
  {
    now = () => new Date(),
    newNonce = () => randomBytes(16).toString('base64')
  } = {}
) => {
  // yyyy-MM-ddTHH:mm:ssZ (no milliseconds)
  const timestamp = now()
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
  const nonce = newNonce()
  const payload = ['v3', clientId, '', '', timestamp, nonce].join('\n')
  const signature = createHmac('sha256', sharedSecret)
    .update(payload)
    .digest('base64')

  return {
    'x-cdp-client-id': clientId,
    'x-cdp-auth-timestamp': timestamp,
    'x-cdp-auth-nonce': nonce,
    'x-cdp-auth-signature': signature
  }
}

/**
 * How long one request to Reg Accred may take before it is abandoned. Without
 * it a slow Reg Accred holds the caller for undici's 300 second default.
 */
export const REG_ACCRED_REQUEST_TIMEOUT_MS = 10_000

/**
 * The options a request to Reg Accred is sent with: signed, asking for JSON,
 * and abandoned after `timeoutMs`.
 *
 * @param {RegAccredApiConfig} config
 * @param {number} [timeoutMs]
 * @returns {RequestInit}
 */
export const regAccredRequestOptions = (
  config,
  timeoutMs = REG_ACCRED_REQUEST_TIMEOUT_MS
) => ({
  headers: { accept: 'application/json', ...signedHeaders(config) },
  signal: AbortSignal.timeout(timeoutMs)
})
