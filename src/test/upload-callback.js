import {
  signedUploadCallbackPath,
  toUploadCallbackKey,
  toUploadCallbackPath
} from '#common/helpers/auth/upload-callback-signature.js'

const TEST_CALLBACK_HMAC_KEY = toUploadCallbackKey('0'.repeat(64))

/**
 * An upload-completed path signed as CDP Uploader would receive it, with the
 * key the test setup configures.
 *
 * @param {string} path
 * @returns {string}
 */
export const signedCallback = (path) =>
  signedUploadCallbackPath(TEST_CALLBACK_HMAC_KEY, toUploadCallbackPath(path))
