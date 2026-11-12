import { isHex256Bit } from '#common/helpers/is-hex-256-bit.js'

/**
 * @param {unknown} value
 */
const validateHex256BitKey = (value) => {
  if (!isHex256Bit(value)) {
    throw new Error(
      'must be 64 lowercase hex characters (openssl rand -hex 32)'
    )
  }
}

export const convictValidateHex256BitKey = {
  name: 'hex-256-bit-key',
  validate: validateHex256BitKey
}
