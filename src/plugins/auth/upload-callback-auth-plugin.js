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
        authenticate: (request, h) =>
          isUploadCallbackSignatureValid(
            key,
            toUploadCallbackPath(request.path),
            request.query.signature
          )
            ? h.authenticated({ credentials: CDP_UPLOADER })
            : h.unauthenticated(Boom.unauthorized())
      }))

      server.auth.strategy(STRATEGY_NAME, SCHEME_NAME)
    }
  }
}
