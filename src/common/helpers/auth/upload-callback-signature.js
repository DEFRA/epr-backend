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
 *
 * Where CDP Uploader calls back, and the signature it sends back in the
 * callback's metadata.
 *
 * @typedef {{ signature: string, url: string }} UploadCallback
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
 * A signature only this service can make for a callback path, so a callback
 * carrying it proves it was set up by us for that path.
 *
 * @param {UploadCallbackKey} key
 * @param {UploadCallbackPath} path
 * @returns {string}
 */
export const uploadCallbackSignature = (key, path) =>
  signatureFor(key, path).toString('hex')

/**
 * The key this service signs and checks upload callbacks with.
 *
 * @returns {UploadCallbackKey}
 */
export const uploadCallbackKey = () =>
  toUploadCallbackKey(config.get('cdpUploader.callbackHmacKey'))

/**
 * What to give CDP Uploader for an upload's callback: this service's URL for
 * the path, and the signature for it to send back in the callback's metadata.
 * The URL stays free of the signature because CDP Uploader and the ingress
 * both log it.
 *
 * @param {UploadCallbackPath} path
 * @returns {UploadCallback}
 */
export const uploadCallback = (path) => ({
  url: `${config.get('appBaseUrl')}${path}`,
  signature: uploadCallbackSignature(uploadCallbackKey(), path)
})

/**
 * @param {UploadCallbackKey} key
 * @param {UploadCallbackPath} path
 * @param {unknown} signature
 * @returns {boolean}
 */
export const isUploadCallbackSignatureValid = (key, path, signature) =>
  isHex256Bit(signature) &&
  timingSafeEqual(Buffer.from(signature, 'hex'), signatureFor(key, path))
