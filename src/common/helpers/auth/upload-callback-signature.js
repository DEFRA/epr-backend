import { createHmac, timingSafeEqual } from 'node:crypto'

import { isHex256Bit } from '#common/helpers/is-hex-256-bit.js'
import { config } from '#root/config.js'

/** @import {Brand} from '#common/helpers/brand.js' */

/**
 * The key this service signs upload callbacks with: 64 hex characters.
 *
 * @typedef {Brand<string, 'UploadCallbackKey'>} UploadCallbackKey
 *
 * The path CDP Uploader calls back on, the part of the callback URL the
 * signature covers.
 *
 * @typedef {Brand<string, 'UploadCallbackPath'>} UploadCallbackPath
 */

/**
 * @param {string} value
 * @returns {UploadCallbackKey}
 */
export const toUploadCallbackKey = (value) =>
  /** @type {UploadCallbackKey} */ (value)

/**
 * @param {string} value
 * @returns {UploadCallbackPath}
 */
export const toUploadCallbackPath = (value) =>
  /** @type {UploadCallbackPath} */ (value)

/**
 * @param {UploadCallbackKey} key
 * @param {UploadCallbackPath} path
 * @returns {Buffer}
 */
const signatureFor = (key, path) =>
  createHmac('sha256', Buffer.from(key, 'hex')).update(path).digest()

/**
 * The path CDP Uploader calls back on, with a signature only this service can
 * make, so a callback proves it was set up by us for that path.
 *
 * @param {UploadCallbackKey} key
 * @param {UploadCallbackPath} path
 * @returns {string}
 */
export const signedUploadCallbackPath = (key, path) =>
  `${path}?signature=${signatureFor(key, path).toString('hex')}`

/**
 * The URL to give CDP Uploader for an upload's callback: this service's base
 * URL and the signed path.
 *
 * @param {UploadCallbackPath} path
 * @returns {string}
 */
export const uploadCallbackUrl = (path) =>
  `${config.get('appBaseUrl')}${signedUploadCallbackPath(
    toUploadCallbackKey(config.get('cdpUploader.callbackHmacKey')),
    path
  )}`

/**
 * @param {UploadCallbackKey} key
 * @param {UploadCallbackPath} path
 * @param {unknown} signature
 * @returns {boolean}
 */
export const isUploadCallbackSignatureValid = (key, path, signature) =>
  isHex256Bit(signature) &&
  timingSafeEqual(Buffer.from(signature, 'hex'), signatureFor(key, path))
