import { createHmac } from 'node:crypto'

/**
 * The CDP v3 signature for the given headers, as Reg Accred checks it.
 *
 * @param {{ get: (name: string) => string | null }} headers
 * @param {string} sharedSecret
 */
export const expectedSignature = (headers, sharedSecret) =>
  createHmac('sha256', sharedSecret)
    .update(
      [
        'v3',
        headers.get('x-cdp-client-id'),
        '',
        '',
        headers.get('x-cdp-auth-timestamp'),
        headers.get('x-cdp-auth-nonce')
      ].join('\n')
    )
    .digest('base64')
