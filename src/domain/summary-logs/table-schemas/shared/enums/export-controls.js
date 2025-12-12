/**
 * Valid export control types for waste shipments
 *
 * These are the allowed values for the EXPORT_CONTROLS field,
 * indicating the regulatory framework under which waste is exported.
 *
 * - Article 18 (green list): Simplified controls for non-hazardous waste
 * - Prior Informed Consent: Full notification controls for other waste
 */
export const EXPORT_CONTROLS = Object.freeze([
  'Article 18 (green list)',
  'Prior Informed Consent (notification controls)'
])
