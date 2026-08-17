/**
 * Enumerated `requiredBy` codes carried on each incomplete-cell entry in the
 * report-completeness error payload. The frontend (PAE-1794) maps these to
 * operator-facing copy and section labels via its language file, so the codes
 * are a stable contract: rename with care.
 *
 * @typedef {(typeof REQUIRED_BY)[keyof typeof REQUIRED_BY]} RequiredByCode
 */
export const REQUIRED_BY = Object.freeze({
  SUPPLIER_DETAILS: 'supplier_details',
  OVERSEAS_SITE: 'overseas_site',
  FINAL_DESTINATION: 'final_destination',
  INTERIM_SITE: 'interim_site'
})
