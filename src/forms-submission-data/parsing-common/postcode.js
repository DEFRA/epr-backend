import { createHash } from 'node:crypto'

export function normalizePostcode(postcode) {
  return postcode?.replaceAll(/\s/g, '').toUpperCase()
}

export function postCodeForLogging(postcode) {
  const normalized = normalizePostcode(postcode)
  if (!normalized) {
    return postcode
  }
  return createHash('sha256').update(normalized).digest('hex')
}

export function comparePostcodes(postcode1, postcode2) {
  if (!postcode1 || !postcode2) {
    return false
  }
  return normalizePostcode(postcode1) === normalizePostcode(postcode2)
}
