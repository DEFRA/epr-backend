/**
 * Parse UK address string into structured components
 * @param {string} addressString - Comma-separated UK address string
 * @returns {Object} Structured address with line1, line2, town, county, postcode, fullAddress when ambiguous

 */
export function parseUkAddress(addressString) {
  if (!addressString || typeof addressString !== 'string') {
    return { fullAddress: addressString || '' }
  }

  const parts = addressString
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')

  if (parts.length < 3) {
    return { fullAddress: addressString }
  }

  const middleParts = parts.slice(1, -1)

  const result = {
    line1: parts[0],
    postcode: parts[parts.length - 1]
  }

  if (middleParts.length === 1) {
    // Only town (certain)
    result.line2 = ''
    result.town = middleParts[0]
    result.county = ''
  } else if (middleParts.length === 3) {
    // (line2, town, county) - certain
    result.line2 = middleParts[0]
    result.town = middleParts[1]
    result.county = middleParts[2]
  } else {
    // Ambiguous: cannot determine structure with certainty
    result.fullAddress = addressString
  }

  return result
}
