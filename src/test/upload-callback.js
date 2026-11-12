import {
  toUploadCallbackPath,
  uploadCallbackKey,
  uploadCallbackSignature
} from '#common/helpers/auth/upload-callback-signature.js'

/** @import { Server, ServerInjectOptions } from '@hapi/hapi' */

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
 * @param {string | ServerInjectOptions} options
 * @returns {options is ServerInjectOptions & { url: string }}
 */
const isUploadCompletedPost = (options) =>
  typeof options !== 'string' &&
  options.method === 'POST' &&
  typeof options.url === 'string' &&
  options.url.endsWith('/upload-completed')

/**
 * The server, with the upload-completed callbacks injected into it signed as
 * CDP Uploader would send them, so tests of what a callback does need not
 * build the signature themselves.
 *
 * @template S
 * @param {S} testServer
 * @returns {S}
 */
export const signingUploadCompletedCallbacks = (testServer) => {
  const server = /** @type {Pick<Server, 'inject'>} */ (testServer)
  const inject = server.inject.bind(server)

  server.inject = /** @type {Server['inject']} */ (
    (/** @type {string | ServerInjectOptions} */ options) =>
      inject(
        isUploadCompletedPost(options)
          ? {
              ...options,
              payload: signedCallbackPayload(
                options.url,
                /** @type {object} */ (options.payload)
              )
            }
          : options
      )
  )

  return testServer
}
