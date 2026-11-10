import { createHmac, timingSafeEqual } from 'node:crypto'

import { config } from '#root/config.js'

/**
 * @param {string} key - 64 hex characters
 * @param {string} path
 * @returns {Buffer}
 */
const signatureFor = (key, path) =>
  createHmac('sha256', Buffer.from(key, 'hex')).update(path).digest()

/**
 * The path CDP Uploader calls back on, with a signature only this service can
 * make, so a callback proves it was set up by us for that path.
 *
 * @param {string} key - 64 hex characters
 * @param {string} path
 * @returns {string}
 */
export const signedUploadCallbackPath = (key, path) =>
  `${path}?signature=${signatureFor(key, path).toString('hex')}`

/**
 * The URL to give CDP Uploader for an upload's callback: this service's base
 * URL and the signed path.
 *
 * @param {string} path
 * @returns {string}
 */
export const uploadCallbackUrl = (path) =>
  `${config.get('appBaseUrl')}${signedUploadCallbackPath(config.get('cdpUploader.callbackHmacKey'), path)}`

/**
 * @param {string} key - 64 hex characters
 * @param {string} path
 * @param {unknown} signature
 * @returns {boolean}
 */
export const isUploadCallbackSignatureValid = (key, path, signature) => {
  if (typeof signature !== 'string') {
    return false
  }
  const expected = signatureFor(key, path)
  const given = Buffer.from(signature, 'hex')
  return given.length === expected.length && timingSafeEqual(given, expected)
}
