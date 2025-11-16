const MIN_ADDRESS_PARTS = 3
const SINGLE_MIDDLE_PART = 1
const THREE_MIDDLE_PARTS = 3

/**
 * Parse UK address string into structured components
 * @param {string} addressString - Comma-separated UK address string
 * @returns {Object} Structured address with line1, line2, town, county, postcode, fullAddress when ambiguous

 */
export function parseUkAddress(addressString) {
  if (!addressString || typeof addressString !== 'string') {
    return undefined
  }

  const parts = addressString
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')

  if (parts.length < MIN_ADDRESS_PARTS) {
    return { fullAddress: addressString, country: 'UK' }
  }

  const middleParts = parts.slice(1, -1)

  const result = {
    line1: parts.at(0),
    postcode: parts.at(-1),
    country: 'UK'
  }

  if (middleParts.length === SINGLE_MIDDLE_PART) {
    result.town = middleParts[0]
  } else if (middleParts.length === THREE_MIDDLE_PARTS) {
    result.line2 = middleParts[0]
    result.town = middleParts[1]
    result.county = middleParts[2]
  } else {
    result.fullAddress = addressString
  }

  return result
}
