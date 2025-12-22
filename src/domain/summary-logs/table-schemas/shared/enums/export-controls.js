/**
 * Valid export control types for waste shipments
 *
 * These are the allowed values for the EXPORT_CONTROLS field,
 * indicating the regulatory framework under which waste is exported.
 *
 * - Article 18 (Green list): Simplified controls for non-hazardous waste
 * - Prior informed consent: Full notification controls for other waste
 */
export const EXPORT_CONTROLS = Object.freeze([
  'Article 18 (Green list)',
  'Prior informed consent (notification controls)'
])
