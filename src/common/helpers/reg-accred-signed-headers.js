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
