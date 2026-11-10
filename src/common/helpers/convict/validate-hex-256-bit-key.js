const HEX_256_BIT_KEY = /^[0-9a-f]{64}$/

/**
 * @param {unknown} value
 */
const validateHex256BitKey = (value) => {
  if (typeof value !== 'string' || !HEX_256_BIT_KEY.test(value)) {
    throw new Error(
      'must be 64 lowercase hex characters (openssl rand -hex 32)'
    )
  }
}

export const convictValidateHex256BitKey = {
  name: 'hex-256-bit-key',
  validate: validateHex256BitKey
}
