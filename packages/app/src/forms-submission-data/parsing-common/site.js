import { createHash } from 'node:crypto'

function normalise(value) {
  return value?.replaceAll(/\s/g, '').toUpperCase()
}

function hashValue(value) {
  const normalized = normalise(value)
  if (!normalized) {
    return value
  }
  return createHash('sha256').update(normalized).digest('hex')
}

/**
 * Compares two sites by their address postcode
 * @param {Object} site1 - First site object with address property
 * @param {Object} site2 - Second site object with address property
 * @returns {boolean} True if sites match
 */
export function compareSite(site1, site2) {
  if (!site1.address.postcode || !site2.address.postcode) {
    return false
  }
  return normalise(site1.address.postcode) === normalise(site2.address.postcode)
}

/**
 * Generates a log-safe string with hashed site information
 * @param {Object} site - Site object with address property
 * @returns {string} String with hashed line1 and postcode
 */
export function siteInfoToLog(site) {
  const line1Hash = hashValue(site.address.line1)
  const postcodeHash = hashValue(site.address.postcode)
  return `line1=${line1Hash}, postcode=${postcodeHash}`
}
