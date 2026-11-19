import {
  toUploadCallbackPath,
  uploadCallbackKey,
  uploadCallbackSignature
} from '#common/helpers/auth/upload-callback-signature.js'

/** @import { ServerInjectOptions } from '@hapi/hapi' */

/**
 * The signature for a callback path, with the key the test setup configures.
 *
 * @param {string} path
 * @returns {string}
 */
const callbackSignatureFor = (path) =>
  uploadCallbackSignature(uploadCallbackKey(), toUploadCallbackPath(path))

/**
 * A callback body as CDP Uploader sends it: the payload, with its metadata
 * carrying the signature for the path.
 *
 * @template {object} T
 * @param {string} path
 * @param {T} payload
 * @returns {T & { metadata: { signature: string } }}
 */
export const signedCallbackPayload = (path, payload) => ({
  ...payload,
  metadata: {
    .../** @type {{ metadata?: object }} */ (payload).metadata,
    signature: callbackSignatureFor(path)
  }
})

/**
 * A callback to inject, posted to the path as CDP Uploader would send it.
 *
 * @template {object} T
 * @param {string} path
 * @param {T} payload
 * @returns {ServerInjectOptions & { payload: T & { metadata: { signature: string } } }}
 */
export const signedCallbackRequest = (path, payload) => ({
  method: 'POST',
  url: path,
  payload: signedCallbackPayload(path, payload)
})
