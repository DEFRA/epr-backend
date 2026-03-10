import { randomUUID } from 'node:crypto'

/**
 * Builds a valid overseas site for testing with sensible defaults.
 * All required fields are populated, with optional overrides.
 *
 * @param {Partial<import('../port.js').OverseasSite>} overrides
 * @returns {Omit<import('../port.js').OverseasSite, 'id'>}
 */
export const buildOverseasSite = (overrides = {}) => {
  const now = new Date()
  const { address: addressOverrides, ...rest } = overrides

  return {
    name: `Test Reprocessor ${randomUUID().slice(0, 8)}`,
    address: {
      line1: '1 Test Street',
      townOrCity: 'TESTTOWN',
      ...addressOverrides
    },
    country: 'India',
    createdAt: now,
    updatedAt: now,
    ...rest
  }
}

/**
 * Builds an overseas site with all optional fields populated.
 *
 * @param {Partial<import('../port.js').OverseasSite>} overrides
 * @returns {Omit<import('../port.js').OverseasSite, 'id'>}
 */
export const buildFullOverseasSite = (overrides = {}) =>
  buildOverseasSite({
    address: {
      line1: '42 Fictitious Lane',
      line2: 'Industrial Zone B',
      townOrCity: 'TESTVILLE',
      stateOrRegion: 'Test Province',
      postcode: '99001'
    },
    coordinates: '51\u00B030\'26.0"N 0\u00B007\'39.0"W',
    validFrom: new Date('2026-01-01'),
    ...overrides
  })
