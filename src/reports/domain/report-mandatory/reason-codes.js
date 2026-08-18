/**
 * Enumerated `requiredBy` codes labelling why a rule makes its fields mandatory
 * (which section of the return they belong to). This is internal rule identity:
 * the codes are NOT serialised in the error payload — that lists field names
 * only — but they group the rules and are the intended breakdown key for the
 * prod-data diagnostic (defra-4ry0). Kept stable so that consumer can rely on
 * them: rename with care.
 *
 * @typedef {(typeof REQUIRED_BY)[keyof typeof REQUIRED_BY]} RequiredByCode
 */
export const REQUIRED_BY = Object.freeze({
  SUPPLIER_DETAILS: 'supplier_details',
  OVERSEAS_SITE: 'overseas_site',
  FINAL_DESTINATION: 'final_destination',
  INTERIM_SITE: 'interim_site',
  EXPORT_DATE: 'export_date'
})
