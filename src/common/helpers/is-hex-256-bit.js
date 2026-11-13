const HEX_256_BIT = /^[0-9a-f]{64}$/

/**
 * A 256-bit value written as 64 lowercase hex characters, the form of an
 * `openssl rand -hex 32` key and of an HMAC-SHA256 digest.
 *
 * @param {unknown} value
 * @returns {value is string}
 */
export const isHex256Bit = (value) =>
  typeof value === 'string' && HEX_256_BIT.test(value)
