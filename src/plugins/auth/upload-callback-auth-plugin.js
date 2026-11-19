import Boom from '@hapi/boom'

import {
  isUploadCallbackSignatureValid,
  toUploadCallbackPath,
  uploadCallbackKey
} from '#common/helpers/auth/upload-callback-signature.js'

/**
 * @import { Server } from '@hapi/hapi'
 * @import { MachineCredentials } from '#common/hapi-types.js'
 */

/** @type {MachineCredentials} */
const CDP_UPLOADER = {
  id: 'cdp-uploader',
  name: 'CDP Uploader',
  isMachine: true
}

/**
 * @param {unknown} payload
 * @returns {unknown}
 */
const signatureIn = (payload) =>
  /** @type {{ metadata?: { signature?: unknown } } | null} */ (payload)
    ?.metadata?.signature

const SCHEME_NAME = 'upload-callback-signature'
export const STRATEGY_NAME = 'upload-callback'

export const uploadCallbackAuthPlugin = {
  plugin: {
    name: 'upload-callback-auth-plugin',
    version: '1.0.0',
    /**
     * @param {Server} server
     */
    register: (server) => {
      const key = uploadCallbackKey()

      server.auth.scheme(SCHEME_NAME, () => ({
        authenticate: (_request, h) =>
          h.authenticated({ credentials: CDP_UPLOADER }),
        payload: (request, h) =>
          isUploadCallbackSignatureValid(
            key,
            toUploadCallbackPath(request.path),
            signatureIn(request.payload)
          )
            ? h.continue
            : Boom.unauthorized(),
        options: { payload: true }
      }))

      server.auth.strategy(STRATEGY_NAME, SCHEME_NAME)
    }
  }
}
