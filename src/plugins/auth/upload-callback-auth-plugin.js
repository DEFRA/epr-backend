import Boom from '@hapi/boom'

import { isUploadCallbackSignatureValid } from '#common/helpers/auth/upload-callback-signature.js'

/**
 * @import { Server } from '@hapi/hapi'
 * @import { Config } from 'convict'
 */

const SCHEME_NAME = 'upload-callback-signature'
export const STRATEGY_NAME = 'upload-callback'

export const uploadCallbackAuthPlugin = {
  plugin: {
    name: 'upload-callback-auth-plugin',
    version: '1.0.0',
    /**
     * @param {Server} server
     * @param {{ config: Config<{ cdpUploader: { callbackHmacKey: string } }> }} options
     */
    register: (server, { config }) => {
      const key = config.get('cdpUploader.callbackHmacKey')

      server.auth.scheme(SCHEME_NAME, () => ({
        authenticate: (request, h) =>
          isUploadCallbackSignatureValid(
            key,
            request.path,
            request.query.signature
          )
            ? h.authenticated({
                credentials: {
                  id: 'cdp-uploader',
                  name: 'CDP Uploader',
                  isMachine: true
                }
              })
            : h.unauthenticated(Boom.unauthorized())
      }))

      server.auth.strategy(STRATEGY_NAME, SCHEME_NAME)
    }
  }
}
