import {
  signedUploadCallbackPath,
  toUploadCallbackPath,
  uploadCallbackKey
} from '#common/helpers/auth/upload-callback-signature.js'

/**
 * An upload-completed path signed as CDP Uploader would receive it, with the
 * key the test setup configures.
 *
 * @param {string} path
 * @returns {string}
 */
export const signedCallback = (path) =>
  signedUploadCallbackPath(uploadCallbackKey(), toUploadCallbackPath(path))
