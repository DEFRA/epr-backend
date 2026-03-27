export const CLASSIFICATION_REASON = Object.freeze({
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  PRN_ISSUED: 'PRN_ISSUED',
  OUTSIDE_ACCREDITATION_PERIOD: 'OUTSIDE_ACCREDITATION_PERIOD',
  PRODUCT_WEIGHT_NOT_ADDED: 'PRODUCT_WEIGHT_NOT_ADDED',
  ORS_NOT_APPROVED: 'ORS_NOT_APPROVED'
})

/**
 * Sentinel indicating ORS validation is disabled by feature flag.
 * Pass this instead of an overseas sites map when the feature is off.
 * @type {unique symbol}
 */
export const ORS_VALIDATION_DISABLED = Symbol('ORS_VALIDATION_DISABLED')
