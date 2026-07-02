export const CLASSIFICATION_REASON = Object.freeze({
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  PRN_ISSUED: 'PRN_ISSUED',
  OUTSIDE_ACCREDITATION_PERIOD: 'OUTSIDE_ACCREDITATION_PERIOD',
  PRODUCT_WEIGHT_NOT_ADDED: 'PRODUCT_WEIGHT_NOT_ADDED',
  ORS_NOT_APPROVED: 'ORS_NOT_APPROVED',
  ORS_NOT_FOUND: 'ORS_NOT_FOUND',
  NOT_ACCREDITED: 'NOT_ACCREDITED',
  SECTION_NOT_INCLUDED_IN_WASTE_BALANCE:
    'SECTION_NOT_INCLUDED_IN_WASTE_BALANCE',
  SUBMITTED_ON_REGISTERED_ONLY_TEMPLATE: 'SUBMITTED_ON_REGISTERED_ONLY_TEMPLATE'
})

/**
 * Sentinel indicating no overseas-sites resolution applies for this caller —
 * either because the processing type is not EXPORTER, or because the caller
 * is reusing classification logic for a purpose that does not require ORS
 * approval checks (e.g. date-range ignore detection).
 * @type {unique symbol}
 */
export const ORS_VALIDATION_DISABLED = Symbol('ORS_VALIDATION_DISABLED')
